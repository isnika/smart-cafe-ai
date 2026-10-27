package com.smart_cafe_ai.inventory_service.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.inventory_service.config.RabbitMQConfig;
import com.smart_cafe_ai.inventory_service.dto.event.OrderItemEvent;
import com.smart_cafe_ai.inventory_service.dto.internal.AvailabilityCheckRequest;
import com.smart_cafe_ai.inventory_service.dto.internal.AvailabilityCheckResponse;
import com.smart_cafe_ai.inventory_service.dto.inventory.InventoryLogResponse;
import com.smart_cafe_ai.inventory_service.dto.inventory.StockAdjustmentRequest;
import com.smart_cafe_ai.inventory_service.dto.inventory.StockResponse;
import com.smart_cafe_ai.inventory_service.entity.*;
import com.smart_cafe_ai.inventory_service.enums.OutboxStatus;
import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import com.smart_cafe_ai.inventory_service.exception.BusinessException;
import com.smart_cafe_ai.inventory_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.inventory_service.repository.*;
import com.smart_cafe_ai.inventory_service.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryServiceImpl implements InventoryService {

    private final InventoryRepository inventoryRepository;
    private final IngredientRepository ingredientRepository;
    private final InventoryLogRepository inventoryLogRepository;
    private final RecipeRepository recipeRepository;
    private final OptionRecipeAdjustmentRepository optionRecipeAdjustmentRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ProcessedEventRepository processedEventRepository;
    private final ObjectMapper objectMapper;

    // ============================
    // Stock Query
    // ============================

    @Override
    @Transactional(readOnly = true)
    public List<StockResponse> getStocks(Integer branchId, Integer ingredientId) {
        List<Inventory> inventories = inventoryRepository.findByFilter(branchId, ingredientId);

        List<Integer> ingredientIds = inventories.stream()
                .map(Inventory::getIngredientId)
                .distinct()
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        return inventories.stream()
                .map(inv -> toStockResponse(inv, ingredientMap.get(inv.getIngredientId())))
                .collect(Collectors.toList());
    }

    // ============================
    // Stock Adjustment
    // ============================

    @Override
    @Transactional
    public StockResponse adjustStock(StockAdjustmentRequest request) {
        if (request.getTransactionType() != TransactionType.Adjustment
                && request.getTransactionType() != TransactionType.Waste) {
            throw new BusinessException("INVALID_TRANSACTION_TYPE",
                    "Chỉ chấp nhận loại giao dịch Adjustment hoặc Waste");
        }

        Ingredient ingredient = ingredientRepository.findById(request.getIngredientId())
                .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", request.getIngredientId()));

        Inventory inventory = inventoryRepository
                .findByBranchIdAndIngredientIdForUpdate(request.getBranchId(), request.getIngredientId())
                .orElseGet(() -> Inventory.builder()
                        .branchId(request.getBranchId())
                        .ingredientId(request.getIngredientId())
                        .quantityInStock(BigDecimal.ZERO)
                        .build());

        BigDecimal newQty = inventory.getQuantityInStock().add(request.getQuantityChanged());
        if (newQty.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("INSUFFICIENT_STOCK",
                    "Số lượng tồn kho không đủ để thực hiện điều chỉnh");
        }

        inventory.setQuantityInStock(newQty);
        inventoryRepository.save(inventory);

        // Log
        InventoryLog logEntry = InventoryLog.builder()
                .branchId(request.getBranchId())
                .ingredientId(request.getIngredientId())
                .transactionType(request.getTransactionType())
                .quantityChanged(request.getQuantityChanged())
                .balanceAfter(newQty)
                .referenceType("MANUAL")
                .referenceId(request.getNote())
                .reason(request.getNote() != null ? request.getNote() : "Manual adjustment")
                .createdBy("1")
                .build();
        inventoryLogRepository.save(logEntry);

        return toStockResponse(inventory, ingredient);
    }

    // ============================
    // Logs Query
    // ============================

    @Override
    @Transactional(readOnly = true)
    public Page<InventoryLogResponse> getLogs(Integer branchId, Integer ingredientId,
                                               TransactionType type, Pageable pageable) {
        Page<InventoryLog> page = inventoryLogRepository.findByFilter(branchId, ingredientId, type, pageable);

        List<Integer> ingredientIds = page.getContent().stream()
                .map(InventoryLog::getIngredientId)
                .distinct()
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        return page.map(logEntry -> {
            Ingredient ingredient = ingredientMap.get(logEntry.getIngredientId());
            return InventoryLogResponse.builder()
                    .id(logEntry.getId())
                    .branchId(logEntry.getBranchId())
                    .ingredientId(logEntry.getIngredientId())
                    .ingredientName(ingredient != null ? ingredient.getName() : "Unknown")
                    .transactionType(logEntry.getTransactionType())
                    .quantityChanged(logEntry.getQuantityChanged())
                    .referenceType(logEntry.getReferenceType())
                    .referenceId(logEntry.getReferenceId())
                    .createdAt(logEntry.getCreatedAt())
                    .build();
        });
    }

    // ============================
    // Availability Check (Internal)
    // ============================

    @Override
    @Transactional(readOnly = true)
    public AvailabilityCheckResponse checkAvailability(AvailabilityCheckRequest request) {
        List<AvailabilityCheckResponse.InsufficientItem> insufficientItems = new ArrayList<>();
        List<AvailabilityCheckResponse.VariantAvailabilityResult> variantResults = new ArrayList<>();

        for (var item : request.getItems()) {
            int orderQty = item.getQuantity() != null && item.getQuantity() > 0 ? item.getQuantity() : 1;

            // Map: ingredientId -> required per 1 unit of this variant
            Map<Integer, BigDecimal> requiredPerUnitMap = new HashMap<>();

            // 1. Base recipe
            List<Recipe> recipes = recipeRepository.findByVariantId(item.getVariantId());
            for (Recipe recipe : recipes) {
                requiredPerUnitMap.merge(recipe.getIngredientId(), recipe.getQuantityRequired(), BigDecimal::add);
            }

            // 2. Options adjustment
            if (item.getOptions() != null && !item.getOptions().isEmpty()) {
                for (var opt : item.getOptions()) {
                    if (opt.getOptionId() != null) {
                        int optQty = opt.getQuantity() != null ? opt.getQuantity() : 1;
                        List<OptionRecipeAdjustment> adjustments = optionRecipeAdjustmentRepository.findByOptionId(opt.getOptionId());
                        for (OptionRecipeAdjustment adj : adjustments) {
                            BigDecimal delta = adj.getQuantityDelta().multiply(BigDecimal.valueOf(optQty));
                            requiredPerUnitMap.merge(adj.getIngredientId(), delta, BigDecimal::add);
                        }
                    }
                }
            }

            // If no recipe and no adjustments, consider available
            if (requiredPerUnitMap.isEmpty()) {
                variantResults.add(AvailabilityCheckResponse.VariantAvailabilityResult.builder()
                        .variantId(item.getVariantId())
                        .canMake(true)
                        .maxQuantity(9999)
                        .missingIngredients(new ArrayList<>())
                        .build());
                continue;
            }

            boolean canMakeVariant = true;
            int maxVariantQty = Integer.MAX_VALUE;
            List<AvailabilityCheckResponse.MissingIngredient> missingForVariant = new ArrayList<>();

            for (Map.Entry<Integer, BigDecimal> entry : requiredPerUnitMap.entrySet()) {
                Integer ingredientId = entry.getKey();
                BigDecimal perUnit = entry.getValue();

                // If perUnit <= 0 (e.g. subtracted option resulting in 0 or less), skip check
                if (perUnit.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

                BigDecimal totalRequired = perUnit.multiply(BigDecimal.valueOf(orderQty));

                Optional<Inventory> inv = inventoryRepository.findByBranchIdAndIngredientId(
                        request.getBranchId(), ingredientId);

                // Effective stock = quantity_in_stock - reserved_quantity
                BigDecimal stock = inv.map(i -> {
                    BigDecimal qty = i.getQuantityInStock() != null ? i.getQuantityInStock() : BigDecimal.ZERO;
                    BigDecimal res = i.getReservedQuantity() != null ? i.getReservedQuantity() : BigDecimal.ZERO;
                    BigDecimal eff = qty.subtract(res);
                    return eff.compareTo(BigDecimal.ZERO) > 0 ? eff : BigDecimal.ZERO;
                }).orElse(BigDecimal.ZERO);

                // Calculate max units possible from this ingredient
                int possibleUnits = stock.divideToIntegralValue(perUnit).intValue();
                if (possibleUnits < maxVariantQty) {
                    maxVariantQty = possibleUnits;
                }

                if (stock.compareTo(totalRequired) < 0) {
                    canMakeVariant = false;
                    Ingredient ing = ingredientRepository.findById(ingredientId).orElse(null);
                    String ingName = ing != null ? ing.getName() : "Unknown";

                    missingForVariant.add(AvailabilityCheckResponse.MissingIngredient.builder()
                            .ingredientId(ingredientId)
                            .ingredientName(ingName)
                            .required(totalRequired)
                            .available(stock)
                            .build());

                    insufficientItems.add(AvailabilityCheckResponse.InsufficientItem.builder()
                            .variantId(item.getVariantId())
                            .ingredientId(ingredientId)
                            .ingredientName(ingName)
                            .required(totalRequired)
                            .available(stock)
                            .build());
                }
            }

            if (maxVariantQty == Integer.MAX_VALUE) {
                maxVariantQty = 9999;
            }

            variantResults.add(AvailabilityCheckResponse.VariantAvailabilityResult.builder()
                    .variantId(item.getVariantId())
                    .canMake(canMakeVariant)
                    .maxQuantity(maxVariantQty)
                    .missingIngredients(missingForVariant)
                    .build());
        }

        boolean overallAvailable = insufficientItems.isEmpty();

        return AvailabilityCheckResponse.builder()
                .available(overallAvailable)
                .canMake(overallAvailable)
                .items(variantResults)
                .insufficientItems(insufficientItems)
                .build();
    }

    // ============================
    // Order Event Processing
    // ============================

    @Override
    @Transactional
    public void processOrderConfirmed(String eventId, Long orderId, Integer branchId,
                                       List<OrderItemEvent> items) {
        // Idempotency check
        if (processedEventRepository.existsByEventId(eventId)) {
            log.info("Event {} already processed, skipping", eventId);
            return;
        }

        log.info("Processing OrderConfirmed event: eventId={}, orderId={}, branchId={}", eventId, orderId, branchId);

        for (OrderItemEvent item : items) {
            List<Recipe> recipes = recipeRepository.findByVariantId(item.getVariantId());
            for (Recipe recipe : recipes) {
                BigDecimal quantityToDeduct = recipe.getQuantityRequired()
                        .multiply(BigDecimal.valueOf(item.getQuantity()));

                Inventory inventory = inventoryRepository
                        .findByBranchIdAndIngredientIdForUpdate(branchId, recipe.getIngredientId())
                        .orElseGet(() -> Inventory.builder()
                                .branchId(branchId)
                                .ingredientId(recipe.getIngredientId())
                                .quantityInStock(BigDecimal.ZERO)
                                .build());

                boolean wasPositive = inventory.getQuantityInStock().compareTo(BigDecimal.ZERO) > 0;
                BigDecimal newQty = inventory.getQuantityInStock().subtract(quantityToDeduct);
                inventory.setQuantityInStock(newQty);
                inventoryRepository.save(inventory);

                // Log deduction
                InventoryLog logEntry = InventoryLog.builder()
                        .branchId(branchId)
                        .ingredientId(recipe.getIngredientId())
                        .transactionType(TransactionType.Auto_Deduct)
                        .quantityChanged(quantityToDeduct.negate())
                        .balanceAfter(newQty)
                        .referenceType("ORDER")
                        .referenceId(orderId.toString())
                        .build();
                inventoryLogRepository.save(logEntry);

                // BR-INV-03: If stock goes negative, publish VariantAvailabilityChanged
                if (newQty.compareTo(BigDecimal.ZERO) < 0 && wasPositive) {
                    log.warn("Stock went negative for ingredient {} at branch {}. Publishing OutOfStock event.",
                            recipe.getIngredientId(), branchId);
                    publishVariantAvailabilityChanged(item.getVariantId(), branchId, "Out_Of_Stock");
                }
            }
        }

        // Mark event as processed
        processedEventRepository.save(ProcessedEvent.builder()
                .eventId(eventId)
                .eventType("OrderConfirmed")
                .build());

        log.info("Successfully processed OrderConfirmed event: {}", eventId);
    }

    @Override
    @Transactional
    public void processOrderCancelled(String eventId, Long orderId, Integer branchId,
                                       List<OrderItemEvent> items) {
        // Idempotency check
        if (processedEventRepository.existsByEventId(eventId)) {
            log.info("Event {} already processed, skipping", eventId);
            return;
        }

        log.info("Processing OrderCancelled/Rejected event: eventId={}, orderId={}, branchId={}", eventId, orderId, branchId);

        for (OrderItemEvent item : items) {
            List<Recipe> recipes = recipeRepository.findByVariantId(item.getVariantId());
            for (Recipe recipe : recipes) {
                BigDecimal quantityToRefund = recipe.getQuantityRequired()
                        .multiply(BigDecimal.valueOf(item.getQuantity()));

                Inventory inventory = inventoryRepository
                        .findByBranchIdAndIngredientIdForUpdate(branchId, recipe.getIngredientId())
                        .orElseGet(() -> Inventory.builder()
                                .branchId(branchId)
                                .ingredientId(recipe.getIngredientId())
                                .quantityInStock(BigDecimal.ZERO)
                                .build());

                boolean wasNegativeOrZero = inventory.getQuantityInStock().compareTo(BigDecimal.ZERO) <= 0;
                BigDecimal newQty = inventory.getQuantityInStock().add(quantityToRefund);
                inventory.setQuantityInStock(newQty);
                inventoryRepository.save(inventory);

                // Log refund
                InventoryLog logEntry = InventoryLog.builder()
                        .branchId(branchId)
                        .ingredientId(recipe.getIngredientId())
                        .transactionType(TransactionType.Refund)
                        .quantityChanged(quantityToRefund)
                        .balanceAfter(newQty)
                        .referenceType("ORDER")
                        .referenceId(orderId.toString())
                        .build();
                inventoryLogRepository.save(logEntry);

                // If stock was previously out and now positive, publish InStock event
                if (wasNegativeOrZero && newQty.compareTo(BigDecimal.ZERO) > 0) {
                    publishVariantAvailabilityChanged(item.getVariantId(), branchId, "In_Stock");
                }
            }
        }

        // Mark as processed
        processedEventRepository.save(ProcessedEvent.builder()
                .eventId(eventId)
                .eventType("OrderCancelled")
                .build());

        log.info("Successfully processed OrderCancelled event: {}", eventId);
    }

    // ============================
    // Helper Methods
    // ============================

    private void publishVariantAvailabilityChanged(Integer variantId, Integer branchId, String status) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("variant_id", variantId);
            payload.put("branch_id", branchId);
            payload.put("status", status);
            payload.put("timestamp", LocalDateTime.now().toString());

            String payloadJson = objectMapper.writeValueAsString(payload);

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .eventType("VariantAvailabilityChanged")
                    .routingKey(RabbitMQConfig.VARIANT_AVAILABILITY_CHANGED_ROUTING_KEY)
                    .payload(payloadJson)
                    .status(OutboxStatus.Pending)
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize VariantAvailabilityChanged event", e);
        }
    }

    public void publishVariantInStockIfNeeded(Integer variantId, Integer branchId) {
        // Check all ingredients for this variant at this branch
        List<Recipe> recipes = recipeRepository.findByVariantId(variantId);
        if (recipes.isEmpty()) return;

        boolean allAvailable = recipes.stream().allMatch(recipe -> {
            Optional<Inventory> inv = inventoryRepository.findByBranchIdAndIngredientId(
                    branchId, recipe.getIngredientId());
            BigDecimal qty = inv.map(Inventory::getQuantityInStock).orElse(BigDecimal.ZERO);
            return qty.compareTo(BigDecimal.ZERO) > 0;
        });

        if (allAvailable) {
            publishVariantAvailabilityChanged(variantId, branchId, "In_Stock");
        }
    }

    private StockResponse toStockResponse(Inventory inventory, Ingredient ingredient) {
        return StockResponse.builder()
                .id(inventory.getId())
                .branchId(inventory.getBranchId())
                .ingredientId(inventory.getIngredientId())
                .ingredientName(ingredient != null ? ingredient.getName() : "Unknown")
                .unit(ingredient != null ? ingredient.getUnit() : "")
                .quantityInStock(inventory.getQuantityInStock())
                .averageCost(ingredient != null ? ingredient.getAverageCost() : null)
                .build();
    }
}
