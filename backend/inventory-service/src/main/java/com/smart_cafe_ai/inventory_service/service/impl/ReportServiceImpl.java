package com.smart_cafe_ai.inventory_service.service.impl;

import com.smart_cafe_ai.inventory_service.dto.report.CostReportResponse;
import com.smart_cafe_ai.inventory_service.dto.report.IngredientUsageReportResponse;
import com.smart_cafe_ai.inventory_service.entity.Ingredient;
import com.smart_cafe_ai.inventory_service.entity.InventoryLog;
import com.smart_cafe_ai.inventory_service.entity.PurchaseOrder;
import com.smart_cafe_ai.inventory_service.entity.PurchaseOrderDetail;
import com.smart_cafe_ai.inventory_service.enums.PurchaseOrderStatus;
import com.smart_cafe_ai.inventory_service.enums.TransactionType;
import com.smart_cafe_ai.inventory_service.repository.IngredientRepository;
import com.smart_cafe_ai.inventory_service.repository.InventoryLogRepository;
import com.smart_cafe_ai.inventory_service.repository.PurchaseOrderRepository;
import com.smart_cafe_ai.inventory_service.service.ReportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReportServiceImpl implements ReportService {

    private final PurchaseOrderRepository purchaseOrderRepository;
    private final IngredientRepository ingredientRepository;
    private final InventoryLogRepository inventoryLogRepository;

    @Override
    @Transactional(readOnly = true)
    public CostReportResponse getCostReport(Integer branchId, LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt = to.atTime(LocalTime.MAX);

        // Get completed purchase orders in date range
        List<PurchaseOrder> completedOrders = purchaseOrderRepository
                .findByFilter(branchId, PurchaseOrderStatus.Completed, PageRequest.of(0, Integer.MAX_VALUE))
                .getContent()
                .stream()
                .filter(po -> po.getCreatedAt() != null
                        && !po.getCreatedAt().isBefore(fromDt)
                        && !po.getCreatedAt().isAfter(toDt))
                .collect(Collectors.toList());

        // Aggregate by ingredient
        Map<Integer, BigDecimal> qtyByIngredient = new HashMap<>();
        Map<Integer, BigDecimal> costByIngredient = new HashMap<>();

        for (PurchaseOrder po : completedOrders) {
            for (PurchaseOrderDetail detail : po.getDetails()) {
                Integer ingredientId = detail.getIngredientId();
                BigDecimal qty = detail.getQuantity();
                BigDecimal cost = detail.getUnitPrice().multiply(qty);

                qtyByIngredient.merge(ingredientId, qty, BigDecimal::add);
                costByIngredient.merge(ingredientId, cost, BigDecimal::add);
            }
        }

        // Fetch ingredient info
        List<Integer> ingredientIds = new ArrayList<>(qtyByIngredient.keySet());
        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(ingredientIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        List<CostReportResponse.CostReportItem> items = ingredientIds.stream().map(ingredientId -> {
            Ingredient ingredient = ingredientMap.get(ingredientId);
            BigDecimal totalQty = qtyByIngredient.get(ingredientId);
            BigDecimal totalCost = costByIngredient.get(ingredientId);
            BigDecimal avgCost = totalQty.compareTo(BigDecimal.ZERO) > 0
                    ? totalCost.divide(totalQty, 2, java.math.RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            return CostReportResponse.CostReportItem.builder()
                    .ingredientId(ingredientId)
                    .ingredientName(ingredient != null ? ingredient.getName() : "Unknown")
                    .unit(ingredient != null ? ingredient.getUnit() : "")
                    .totalQuantityImported(totalQty)
                    .totalCost(totalCost)
                    .averageCost(avgCost)
                    .build();
        }).collect(Collectors.toList());

        BigDecimal totalImportCost = costByIngredient.values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Calculate waste cost & COGS from Inventory Logs
        List<InventoryLog> logs = inventoryLogRepository.findLogsByBranchAndDateRange(branchId, fromDt, toDt);
        BigDecimal wasteCost = BigDecimal.ZERO;
        BigDecimal cogs = BigDecimal.ZERO;

        for (InventoryLog logEntry : logs) {
            Ingredient ing = ingredientRepository.findById(logEntry.getIngredientId()).orElse(null);
            BigDecimal avgCost = (ing != null && ing.getAverageCost() != null) ? ing.getAverageCost() : BigDecimal.ZERO;
            BigDecimal qty = logEntry.getQuantityChanged().abs();

            if (logEntry.getTransactionType() == TransactionType.Waste) {
                wasteCost = wasteCost.add(qty.multiply(avgCost));
            } else if (logEntry.getTransactionType() == TransactionType.Auto_Deduct) {
                cogs = cogs.add(qty.multiply(avgCost));
            } else if (logEntry.getTransactionType() == TransactionType.Refund) {
                cogs = cogs.subtract(qty.multiply(avgCost));
            }
        }

        return CostReportResponse.builder()
                .branchId(branchId)
                .from(from)
                .to(to)
                .totalImportCost(totalImportCost)
                .purchaseCost(totalImportCost)
                .wasteCost(wasteCost)
                .cogs(cogs.max(BigDecimal.ZERO))
                .items(items)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<IngredientUsageReportResponse> getUsageReport(Integer branchId, LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt = to.atTime(LocalTime.MAX);

        List<InventoryLog> logs = inventoryLogRepository.findLogsByBranchAndDateRange(branchId, fromDt, toDt);

        Map<Integer, BigDecimal> autoDeductMap = new HashMap<>();
        Map<Integer, BigDecimal> wasteMap = new HashMap<>();
        Map<Integer, BigDecimal> refundMap = new HashMap<>();

        for (InventoryLog l : logs) {
            Integer ingId = l.getIngredientId();
            BigDecimal absQty = l.getQuantityChanged().abs();

            if (l.getTransactionType() == TransactionType.Auto_Deduct) {
                autoDeductMap.merge(ingId, absQty, BigDecimal::add);
            } else if (l.getTransactionType() == TransactionType.Waste) {
                wasteMap.merge(ingId, absQty, BigDecimal::add);
            } else if (l.getTransactionType() == TransactionType.Refund) {
                refundMap.merge(ingId, absQty, BigDecimal::add);
            }
        }

        Set<Integer> allIngIds = new HashSet<>();
        allIngIds.addAll(autoDeductMap.keySet());
        allIngIds.addAll(wasteMap.keySet());
        allIngIds.addAll(refundMap.keySet());

        Map<Integer, Ingredient> ingredientMap = ingredientRepository.findAllById(allIngIds)
                .stream().collect(Collectors.toMap(Ingredient::getId, Function.identity()));

        return allIngIds.stream().map(ingId -> {
            Ingredient ing = ingredientMap.get(ingId);
            BigDecimal autoDeduct = autoDeductMap.getOrDefault(ingId, BigDecimal.ZERO);
            BigDecimal waste = wasteMap.getOrDefault(ingId, BigDecimal.ZERO);
            BigDecimal refund = refundMap.getOrDefault(ingId, BigDecimal.ZERO);
            BigDecimal netUsage = autoDeduct.add(waste).subtract(refund);

            return IngredientUsageReportResponse.builder()
                    .ingredientId(ingId)
                    .ingredientName(ing != null ? ing.getName() : "Unknown")
                    .unit(ing != null ? ing.getUnit() : "")
                    .autoDeductQuantity(autoDeduct)
                    .wasteQuantity(waste)
                    .refundQuantity(refund)
                    .netUsage(netUsage)
                    .build();
        }).collect(Collectors.toList());
    }
}
