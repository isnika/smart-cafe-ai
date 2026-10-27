package com.smart_cafe_ai.inventory_service.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.inventory_service.config.RabbitMQConfig;
import com.smart_cafe_ai.inventory_service.dto.purchaseorder.*;
import com.smart_cafe_ai.inventory_service.entity.*;
import com.smart_cafe_ai.inventory_service.enums.OutboxStatus;
import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import com.smart_cafe_ai.inventory_service.exception.BusinessException;
import com.smart_cafe_ai.inventory_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.inventory_service.repository.*;
import com.smart_cafe_ai.inventory_service.service.PurchaseOrderService;
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
public class PurchaseOrderServiceImpl implements PurchaseOrderService {

    private final PurchaseOrderRepository purchaseOrderRepository;
    private final PurchaseOrderDetailRepository poDetailRepository;
    private final SupplierRepository supplierRepository;
    private final IngredientRepository ingredientRepository;
    private final InventoryRepository inventoryRepository;
    private final InventoryLogRepository inventoryLogRepository;
    private final RecipeRepository recipeRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public Page<PurchaseOrderResponse> getPurchaseOrders(Integer branchId, PurchaseOrderStatus status, Pageable pageable) {
        return purchaseOrderRepository.findByFilter(branchId, status, pageable)
                .map(this::toPurchaseOrderResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PurchaseOrderResponse> getPurchaseOrders(Integer branchId, Integer supplierId, PurchaseOrderStatus status, LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return purchaseOrderRepository.findByFilter(branchId, supplierId, status, from, to, pageable)
                .map(this::toPurchaseOrderResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public PurchaseOrderResponse getPurchaseOrderById(Long id) {
        PurchaseOrder po = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn đặt hàng", id));
        return toPurchaseOrderResponse(po);
    }

    @Override
    @Transactional
    public PurchaseOrderResponse createPurchaseOrder(PurchaseOrderRequest request) {
        // Validate supplier
        Supplier supplier = supplierRepository.findById(request.getSupplierId())
                .orElseThrow(() -> new ResourceNotFoundException("Nhà cung cấp", request.getSupplierId()));

        PurchaseOrderStatus poStatus = request.getStatus() != null ? request.getStatus() : PurchaseOrderStatus.Draft;
        PurchaseOrder po = PurchaseOrder.builder()
                .branchId(request.getBranchId())
                .supplierId(request.getSupplierId())
                .status(poStatus)
                .build();

        List<PurchaseOrderDetail> details = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;

        for (PurchaseOrderDetailRequest detailReq : request.getDetails()) {
            Ingredient ingredient = ingredientRepository.findById(detailReq.getIngredientId())
                    .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", detailReq.getIngredientId()));
            BigDecimal subtotal = detailReq.getUnitPrice().multiply(detailReq.getQuantity());
            totalAmount = totalAmount.add(subtotal);

            String pUnit = detailReq.getPurchaseUnit() != null ? detailReq.getPurchaseUnit() : ingredient.getUnit();
            BigDecimal conv = detailReq.getConversionFactor() != null ? detailReq.getConversionFactor() : BigDecimal.ONE;

            PurchaseOrderDetail detail = PurchaseOrderDetail.builder()
                    .purchaseOrder(po)
                    .ingredientId(detailReq.getIngredientId())
                    .purchaseUnit(pUnit)
                    .conversionFactor(conv)
                    .receivedQuantity(BigDecimal.ZERO)
                    .quantity(detailReq.getQuantity())
                    .unitPrice(detailReq.getUnitPrice())
                    .build();
            details.add(detail);
        }

        po.setTotalAmount(totalAmount);
        po.setDetails(details);
        PurchaseOrder saved = purchaseOrderRepository.save(po);

        return toPurchaseOrderResponse(saved);
    }

    @Override
    @Transactional
    public PurchaseOrderResponse updatePurchaseOrder(Long id, PurchaseOrderRequest request) {
        PurchaseOrder po = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn đặt hàng", id));

        if (po.getStatus() != PurchaseOrderStatus.Pending && po.getStatus() != PurchaseOrderStatus.Draft) {
            throw new BusinessException("INVALID_STATUS",
                    "Chỉ có thể cập nhật đơn hàng ở trạng thái Draft hoặc Pending");
        }

        if (!supplierRepository.existsById(request.getSupplierId())) {
            throw new ResourceNotFoundException("Nhà cung cấp", request.getSupplierId());
        }

        // Remove old details and flush to execute delete statements before inserts
        po.getDetails().clear();
        purchaseOrderRepository.saveAndFlush(po);
        po.setBranchId(request.getBranchId());
        po.setSupplierId(request.getSupplierId());

        List<PurchaseOrderDetail> newDetails = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;

        for (PurchaseOrderDetailRequest detailReq : request.getDetails()) {
            Ingredient ingredient = ingredientRepository.findById(detailReq.getIngredientId())
                    .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", detailReq.getIngredientId()));
            BigDecimal subtotal = detailReq.getUnitPrice().multiply(detailReq.getQuantity());
            totalAmount = totalAmount.add(subtotal);

            String pUnit = detailReq.getPurchaseUnit() != null ? detailReq.getPurchaseUnit() : ingredient.getUnit();
            BigDecimal conv = detailReq.getConversionFactor() != null ? detailReq.getConversionFactor() : BigDecimal.ONE;

            PurchaseOrderDetail detail = PurchaseOrderDetail.builder()
                    .purchaseOrder(po)
                    .ingredientId(detailReq.getIngredientId())
                    .purchaseUnit(pUnit)
                    .conversionFactor(conv)
                    .receivedQuantity(BigDecimal.ZERO)
                    .quantity(detailReq.getQuantity())
                    .unitPrice(detailReq.getUnitPrice())
                    .build();
            newDetails.add(detail);
        }

        po.setTotalAmount(totalAmount);
        po.getDetails().addAll(newDetails);

        return toPurchaseOrderResponse(purchaseOrderRepository.save(po));
    }

    @Override
    @Transactional
    public void cancelPurchaseOrder(Long id) {
        PurchaseOrder po = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn đặt hàng", id));

        if (po.getStatus() == PurchaseOrderStatus.Completed || po.getStatus() == PurchaseOrderStatus.Received) {
            throw new BusinessException("INVALID_STATUS",
                    "Không thể hủy đơn hàng đã hoàn thành hoặc đã nhận hàng");
        }
        if (po.getStatus() == PurchaseOrderStatus.Cancelled) {
            throw new BusinessException("INVALID_STATUS", "Đơn hàng đã được hủy trước đó");
        }

        po.setStatus(PurchaseOrderStatus.Cancelled);
        purchaseOrderRepository.save(po);
    }

    @Override
    @Transactional
    public PurchaseOrderResponse orderPurchaseOrder(Long id, LocalDateTime expectedAt) {
        PurchaseOrder po = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn đặt hàng", id));

        if (po.getStatus() != PurchaseOrderStatus.Draft && po.getStatus() != PurchaseOrderStatus.Pending) {
            throw new BusinessException("INVALID_STATUS", "Chỉ có thể đặt hàng từ trạng thái Draft hoặc Pending");
        }

        po.setStatus(PurchaseOrderStatus.Ordered);
        po.setOrderedAt(LocalDateTime.now());
        po.setApprovedBy("system");
        po.setExpectedAt(expectedAt != null ? expectedAt : LocalDateTime.now().plusDays(2));

        return toPurchaseOrderResponse(purchaseOrderRepository.save(po));
    }

    @Override
    @Transactional
    public PurchaseOrderCompleteResponse receiveReceipts(Long id, PurchaseOrderReceiptRequest request) {
        PurchaseOrder po = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn đặt hàng", id));

        if (po.getStatus() != PurchaseOrderStatus.Ordered && po.getStatus() != PurchaseOrderStatus.Partially_Received
                && po.getStatus() != PurchaseOrderStatus.Draft && po.getStatus() != PurchaseOrderStatus.Pending) {
            throw new BusinessException("INVALID_STATUS", "Đơn hàng chưa được đặt hoặc đã nhận hoàn tất");
        }

        Supplier supplier = supplierRepository.findById(po.getSupplierId())
                .orElseThrow(() -> new ResourceNotFoundException("Nhà cung cấp", po.getSupplierId()));

        Map<Integer, PurchaseOrderDetail> detailMap = po.getDetails().stream()
                .collect(Collectors.toMap(PurchaseOrderDetail::getIngredientId, Function.identity()));

        List<UpdatedIngredientInfo> updatedIngredients = new ArrayList<>();
        List<Integer> affectedVariantIds = new ArrayList<>();

        for (var itemReq : request.getItems()) {
            PurchaseOrderDetail detail = detailMap.get(itemReq.getIngredientId());
            if (detail == null) {
                throw new BusinessException("INVALID_INGREDIENT", "Nguyên liệu ID " + itemReq.getIngredientId() + " không thuộc đơn hàng này");
            }

            BigDecimal currentReceived = detail.getReceivedQuantity() != null ? detail.getReceivedQuantity() : BigDecimal.ZERO;
            detail.setReceivedQuantity(currentReceived.add(itemReq.getReceivedQuantity()));

            Ingredient ingredient = ingredientRepository.findById(detail.getIngredientId())
                    .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", detail.getIngredientId()));

            Inventory inventory = inventoryRepository
                    .findByBranchIdAndIngredientIdForUpdate(po.getBranchId(), detail.getIngredientId())
                    .orElseGet(() -> Inventory.builder()
                            .branchId(po.getBranchId())
                            .ingredientId(detail.getIngredientId())
                            .quantityInStock(BigDecimal.ZERO)
                            .build());

            BigDecimal oldStock = inventory.getQuantityInStock().max(BigDecimal.ZERO);
            BigDecimal oldCost = ingredient.getAverageCost() != null ? ingredient.getAverageCost() : BigDecimal.ZERO;
            BigDecimal convFactor = detail.getConversionFactor() != null && detail.getConversionFactor().compareTo(BigDecimal.ZERO) > 0
                    ? detail.getConversionFactor()
                    : BigDecimal.ONE;
            BigDecimal addedQty = itemReq.getReceivedQuantity().multiply(convFactor);
            BigDecimal unitPricePerStockUnit = detail.getUnitPrice().divide(convFactor, 4, RoundingMode.HALF_UP);

            BigDecimal newStock = oldStock.add(addedQty);
            BigDecimal newAvgCost = newStock.compareTo(BigDecimal.ZERO) > 0
                    ? (oldStock.multiply(oldCost).add(addedQty.multiply(unitPricePerStockUnit))).divide(newStock, 2, RoundingMode.HALF_UP)
                    : unitPricePerStockUnit;

            inventory.setQuantityInStock(newStock);
            inventory.setAverageCost(newAvgCost);
            inventoryRepository.save(inventory);

            ingredient.setAverageCost(newAvgCost);
            ingredientRepository.save(ingredient);

            InventoryLog logEntry = InventoryLog.builder()
                    .branchId(po.getBranchId())
                    .ingredientId(detail.getIngredientId())
                    .transactionType(TransactionType.Import)
                    .quantityChanged(addedQty)
                    .balanceAfter(newStock)
                    .referenceType("PURCHASE_ORDER")
                    .referenceId(po.getId().toString())
                    .build();
            inventoryLogRepository.save(logEntry);

            updatedIngredients.add(UpdatedIngredientInfo.builder()
                    .ingredientId(detail.getIngredientId())
                    .name(ingredient.getName())
                    .quantityAdded(addedQty)
                    .newStock(newStock)
                    .newAverageCost(newAvgCost)
                    .build());

            recipeRepository.findAll().stream()
                    .filter(r -> r.getIngredientId().equals(detail.getIngredientId()))
                    .map(Recipe::getVariantId)
                    .distinct()
                    .forEach(affectedVariantIds::add);
        }

        boolean allFullyReceived = po.getDetails().stream().allMatch(d ->
                d.getReceivedQuantity() != null && d.getReceivedQuantity().compareTo(d.getQuantity()) >= 0);

        po.setStatus(allFullyReceived ? PurchaseOrderStatus.Received : PurchaseOrderStatus.Partially_Received);
        po.setReceivedAt(LocalDateTime.now());
        purchaseOrderRepository.save(po);

        if (allFullyReceived) {
            publishPurchaseOrderCompleted(po, updatedIngredients);
        }

        for (Integer variantId : affectedVariantIds.stream().distinct().collect(Collectors.toList())) {
            checkAndPublishVariantInStock(variantId, po.getBranchId());
        }

        return PurchaseOrderCompleteResponse.builder()
                .id(po.getId())
                .branchId(po.getBranchId())
                .supplierId(po.getSupplierId())
                .supplierName(supplier.getName())
                .totalAmount(po.getTotalAmount())
                .status(po.getStatus())
                .updatedIngredients(updatedIngredients)
                .build();
    }

    @Override
    @Transactional
    public PurchaseOrderCompleteResponse completePurchaseOrder(Long id) {
        PurchaseOrder po = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn đặt hàng", id));

        if (po.getStatus() != PurchaseOrderStatus.Pending && po.getStatus() != PurchaseOrderStatus.Draft && po.getStatus() != PurchaseOrderStatus.Ordered) {
            throw new BusinessException("INVALID_STATUS",
                    "Chỉ có thể hoàn thành đơn hàng ở trạng thái Draft, Pending hoặc Ordered");
        }

        Supplier supplier = supplierRepository.findById(po.getSupplierId())
                .orElseThrow(() -> new ResourceNotFoundException("Nhà cung cấp", po.getSupplierId()));

        List<UpdatedIngredientInfo> updatedIngredients = new ArrayList<>();
        List<Integer> affectedVariantIds = new ArrayList<>();

        for (PurchaseOrderDetail detail : po.getDetails()) {
            Ingredient ingredient = ingredientRepository.findById(detail.getIngredientId())
                    .orElseThrow(() -> new ResourceNotFoundException("Nguyên liệu", detail.getIngredientId()));

            // Lock inventory record for update
            Inventory inventory = inventoryRepository
                    .findByBranchIdAndIngredientIdForUpdate(po.getBranchId(), detail.getIngredientId())
                    .orElseGet(() -> Inventory.builder()
                            .branchId(po.getBranchId())
                            .ingredientId(detail.getIngredientId())
                            .quantityInStock(BigDecimal.ZERO)
                            .build());

            // BR-INV-02: Weighted Average Cost
            BigDecimal oldStock = inventory.getQuantityInStock().max(BigDecimal.ZERO);
            BigDecimal oldCost = ingredient.getAverageCost() != null ? ingredient.getAverageCost() : BigDecimal.ZERO;
            BigDecimal addedQty = detail.getQuantity();
            BigDecimal unitPrice = detail.getUnitPrice();

            BigDecimal newStock = oldStock.add(addedQty);
            BigDecimal newAvgCost;
            if (newStock.compareTo(BigDecimal.ZERO) > 0) {
                newAvgCost = (oldStock.multiply(oldCost).add(addedQty.multiply(unitPrice)))
                        .divide(newStock, 2, RoundingMode.HALF_UP);
            } else {
                newAvgCost = unitPrice;
            }

            inventory.setQuantityInStock(newStock);
            inventoryRepository.save(inventory);

            ingredient.setAverageCost(newAvgCost);
            ingredientRepository.save(ingredient);

            // Log import
            InventoryLog logEntry = InventoryLog.builder()
                    .branchId(po.getBranchId())
                    .ingredientId(detail.getIngredientId())
                    .transactionType(TransactionType.Import)
                    .quantityChanged(addedQty)
                    .balanceAfter(newStock)
                    .referenceType("PURCHASE_ORDER")
                    .referenceId(po.getId().toString())
                    .build();
            inventoryLogRepository.save(logEntry);

            updatedIngredients.add(UpdatedIngredientInfo.builder()
                    .ingredientId(detail.getIngredientId())
                    .name(ingredient.getName())
                    .quantityAdded(addedQty)
                    .newStock(newStock)
                    .newAverageCost(newAvgCost)
                    .build());

            // Collect affected variant IDs - need to check if they become available
            recipeRepository.findAll().stream()
                    .filter(r -> r.getIngredientId().equals(detail.getIngredientId()))
                    .map(Recipe::getVariantId)
                    .distinct()
                    .forEach(affectedVariantIds::add);
        }

        po.setStatus(PurchaseOrderStatus.Completed);
        purchaseOrderRepository.save(po);

        // Publish PurchaseOrderCompleted outbox event
        publishPurchaseOrderCompleted(po, updatedIngredients);

        // Check and publish VariantAvailabilityChanged for affected variants
        for (Integer variantId : affectedVariantIds.stream().distinct().collect(Collectors.toList())) {
            checkAndPublishVariantInStock(variantId, po.getBranchId());
        }

        return PurchaseOrderCompleteResponse.builder()
                .id(po.getId())
                .branchId(po.getBranchId())
                .supplierId(po.getSupplierId())
                .supplierName(supplier.getName())
                .totalAmount(po.getTotalAmount())
                .status(po.getStatus())
                .updatedIngredients(updatedIngredients)
                .build();
    }

    // ============================
    // Helper Methods
    // ============================

    private void checkAndPublishVariantInStock(Integer variantId, Integer branchId) {
        List<Recipe> recipes = recipeRepository.findByVariantId(variantId);
        if (recipes.isEmpty()) return;

        boolean allAvailable = recipes.stream().allMatch(recipe -> {
            Optional<Inventory> inv = inventoryRepository.findByBranchIdAndIngredientId(
                    branchId, recipe.getIngredientId());
            BigDecimal qty = inv.map(Inventory::getQuantityInStock).orElse(BigDecimal.ZERO);
            return qty.compareTo(BigDecimal.ZERO) > 0;
        });

        if (allAvailable) {
            try {
                Map<String, Object> payload = new HashMap<>();
                payload.put("variant_id", variantId);
                payload.put("branch_id", branchId);
                payload.put("status", "In_Stock");
                payload.put("timestamp", LocalDateTime.now().toString());

                OutboxEvent outboxEvent = OutboxEvent.builder()
                        .eventType("VariantAvailabilityChanged")
                        .routingKey(RabbitMQConfig.VARIANT_AVAILABILITY_CHANGED_ROUTING_KEY)
                        .payload(objectMapper.writeValueAsString(payload))
                        .status(OutboxStatus.Pending)
                        .build();
                outboxEventRepository.save(outboxEvent);
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize VariantAvailabilityChanged event", e);
            }
        }
    }

    private void publishPurchaseOrderCompleted(PurchaseOrder po, List<UpdatedIngredientInfo> updatedIngredients) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("po_id", po.getId());
            payload.put("branch_id", po.getBranchId());
            payload.put("supplier_id", po.getSupplierId());
            payload.put("total_amount", po.getTotalAmount());
            payload.put("updated_ingredients", updatedIngredients);
            payload.put("timestamp", LocalDateTime.now().toString());

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .eventType("PurchaseOrderCompleted")
                    .routingKey(RabbitMQConfig.PURCHASE_ORDER_COMPLETED_ROUTING_KEY)
                    .payload(objectMapper.writeValueAsString(payload))
                    .status(OutboxStatus.Pending)
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize PurchaseOrderCompleted event", e);
        }
    }

    private PurchaseOrderResponse toPurchaseOrderResponse(PurchaseOrder po) {
        Supplier supplier = supplierRepository.findById(po.getSupplierId()).orElse(null);

        List<Integer> ingredientIds = po.getDetails().stream()
                .map(PurchaseOrderDetail::getIngredientId)
                .collect(Collectors.toList());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        List<PurchaseOrderDetailResponse> detailResponses = po.getDetails().stream()
                .map(detail -> {
                    Ingredient ingredient = ingredientMap.get(detail.getIngredientId());
                    return PurchaseOrderDetailResponse.builder()
                            .id(detail.getId())
                            .ingredientId(detail.getIngredientId())
                            .ingredientName(ingredient != null ? ingredient.getName() : "Unknown")
                            .unit(ingredient != null ? ingredient.getUnit() : "")
                            .quantity(detail.getQuantity())
                            .unitPrice(detail.getUnitPrice())
                            .subtotal(detail.getQuantity().multiply(detail.getUnitPrice()))
                            .build();
                })
                .collect(Collectors.toList());

        return PurchaseOrderResponse.builder()
                .id(po.getId())
                .branchId(po.getBranchId())
                .supplierId(po.getSupplierId())
                .supplierName(supplier != null ? supplier.getName() : "Unknown")
                .totalAmount(po.getTotalAmount())
                .status(po.getStatus())
                .createdAt(po.getCreatedAt())
                .details(detailResponses)
                .build();
    }
}
