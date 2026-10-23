package com.smart_cafe_ai.payment_service.service.impl;

import com.smart_cafe_ai.payment_service.dto.shift.*;
import com.smart_cafe_ai.payment_service.entity.CashMovement;
import com.smart_cafe_ai.payment_service.entity.CashierShift;
import com.smart_cafe_ai.payment_service.enums.CashMovementType;
import com.smart_cafe_ai.payment_service.enums.CashierShiftStatus;
import com.smart_cafe_ai.payment_service.exception.BusinessException;
import com.smart_cafe_ai.payment_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.payment_service.repository.CashMovementRepository;
import com.smart_cafe_ai.payment_service.repository.CashierShiftRepository;
import com.smart_cafe_ai.payment_service.service.CashierShiftService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CashierShiftServiceImpl implements CashierShiftService {

    private final CashierShiftRepository cashierShiftRepository;
    private final CashMovementRepository cashMovementRepository;

    @Override
    @Transactional
    public CashierShiftResponse openShift(OpenShiftRequest request, String staffUserId) {
        // [BR-PAY-03] Mỗi nhân viên tại một thời điểm chỉ được phép mở duy nhất 1 ca
        cashierShiftRepository.findFirstByStaffUserIdAndStatus(staffUserId, CashierShiftStatus.Open)
                .ifPresent(s -> {
                    throw new BusinessException("SHIFT_ALREADY_OPEN", "Nhân viên đang có một ca làm việc chưa đóng (Ca #" + s.getId() + ")", HttpStatus.CONFLICT);
                });

        String registerCode = request.getRegisterCode() != null && !request.getRegisterCode().isBlank()
                ? request.getRegisterCode() : "MAIN";

        cashierShiftRepository.findFirstByBranchIdAndRegisterCodeAndStatus(request.getBranchId(), registerCode, CashierShiftStatus.Open)
                .ifPresent(s -> {
                    throw new BusinessException("REGISTER_ALREADY_OCCUPIED", "Quầy thu ngân " + registerCode + " tại chi nhánh đã có người đang mở ca", HttpStatus.CONFLICT);
                });

        CashierShift shift = CashierShift.builder()
                .branchId(request.getBranchId())
                .registerCode(registerCode)
                .staffUserId(staffUserId)
                .openingTime(LocalDateTime.now())
                .openingCash(request.getOpeningCash() != null ? request.getOpeningCash() : BigDecimal.ZERO)
                .totalOrders(0)
                .totalCashSales(BigDecimal.ZERO)
                .totalOnlineSales(BigDecimal.ZERO)
                .totalCashRefunds(BigDecimal.ZERO)
                .totalCashIn(BigDecimal.ZERO)
                .totalCashOut(BigDecimal.ZERO)
                .status(CashierShiftStatus.Open)
                .build();

        shift = cashierShiftRepository.save(shift);
        log.info("Opened cashier shift #{} for staff {} at branch {}", shift.getId(), staffUserId, request.getBranchId());

        return mapToShiftResponse(shift);
    }

    @Override
    @Transactional(readOnly = true)
    public CashierShiftResponse getCurrentShift(String staffUserId) {
        CashierShift shift = cashierShiftRepository.findFirstByStaffUserIdAndStatus(staffUserId, CashierShiftStatus.Open)
                .orElseThrow(() -> new BusinessException("NO_OPEN_SHIFT", "Nhân viên chưa mở ca thu ngân", HttpStatus.NOT_FOUND));

        return mapToShiftResponse(shift);
    }

    @Override
    @Transactional(readOnly = true)
    public CashierShiftResponse getShiftById(Integer id) {
        CashierShift shift = cashierShiftRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ca thu ngân", id));

        return mapToShiftResponse(shift);
    }

    @Override
    @Transactional
    public CashierShiftResponse closeShift(Integer id, CloseShiftRequest request, String staffUserId) {
        CashierShift shift = cashierShiftRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ca thu ngân", id));

        if (shift.getStatus() != CashierShiftStatus.Open) {
            throw new BusinessException("SHIFT_ALREADY_CLOSED", "Ca thu ngân này đã được đóng trước đó", HttpStatus.BAD_REQUEST);
        }

        // Tính expected_cash = opening_cash + total_cash_sales - total_cash_refunds + total_cash_in - total_cash_out
        BigDecimal expected = shift.getOpeningCash()
                .add(shift.getTotalCashSales())
                .subtract(shift.getTotalCashRefunds())
                .add(shift.getTotalCashIn())
                .subtract(shift.getTotalCashOut());

        BigDecimal closingCash = request.getClosingCash();
        BigDecimal discrepancy = closingCash.subtract(expected);

        shift.setClosingTime(LocalDateTime.now());
        shift.setExpectedCash(expected);
        shift.setClosingCash(closingCash);
        shift.setDiscrepancy(discrepancy);
        shift.setStatus(CashierShiftStatus.Closed);

        shift = cashierShiftRepository.save(shift);
        log.info("Closed cashier shift #{}. Expected: {}, Closing: {}, Discrepancy: {}",
                shift.getId(), expected, closingCash, discrepancy);

        return mapToShiftResponse(shift);
    }

    @Override
    @Transactional
    public CashMovementResponse recordCashMovement(Integer shiftId, CashMovementRequest request, String staffUserId) {
        CashierShift shift = cashierShiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Ca thu ngân", shiftId));

        if (shift.getStatus() != CashierShiftStatus.Open) {
            throw new BusinessException("SHIFT_NOT_OPEN", "Không thể ghi nhận biến động quỹ cho ca đã đóng", HttpStatus.BAD_REQUEST);
        }

        CashMovement movement = CashMovement.builder()
                .cashierShiftId(shiftId)
                .movementType(request.getMovementType())
                .amount(request.getAmount())
                .reason(request.getReason())
                .createdBy(staffUserId)
                .createdAt(LocalDateTime.now())
                .build();

        movement = cashMovementRepository.save(movement);

        // Update shift totals
        if (request.getMovementType() == CashMovementType.Cash_In || request.getMovementType() == CashMovementType.COD_Remittance) {
            shift.setTotalCashIn(shift.getTotalCashIn().add(request.getAmount()));
        } else if (request.getMovementType() == CashMovementType.Cash_Out || request.getMovementType() == CashMovementType.Safe_Drop) {
            shift.setTotalCashOut(shift.getTotalCashOut().add(request.getAmount()));
        }

        cashierShiftRepository.save(shift);

        return CashMovementResponse.builder()
                .id(movement.getId())
                .cashierShiftId(movement.getCashierShiftId())
                .movementType(movement.getMovementType())
                .amount(movement.getAmount())
                .reason(movement.getReason())
                .createdBy(movement.getCreatedBy())
                .createdAt(movement.getCreatedAt())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CashMovementResponse> getCashMovements(Integer shiftId) {
        return cashMovementRepository.findByCashierShiftIdOrderByCreatedAtDesc(shiftId).stream()
                .map(m -> CashMovementResponse.builder()
                        .id(m.getId())
                        .cashierShiftId(m.getCashierShiftId())
                        .movementType(m.getMovementType())
                        .amount(m.getAmount())
                        .reason(m.getReason())
                        .createdBy(m.getCreatedBy())
                        .createdAt(m.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    private CashierShiftResponse mapToShiftResponse(CashierShift shift) {
        return CashierShiftResponse.builder()
                .id(shift.getId())
                .branchId(shift.getBranchId())
                .registerCode(shift.getRegisterCode())
                .staffUserId(shift.getStaffUserId())
                .openingTime(shift.getOpeningTime())
                .closingTime(shift.getClosingTime())
                .openingCash(shift.getOpeningCash())
                .totalOrders(shift.getTotalOrders())
                .totalCashSales(shift.getTotalCashSales())
                .totalOnlineSales(shift.getTotalOnlineSales())
                .totalCashRefunds(shift.getTotalCashRefunds())
                .totalCashIn(shift.getTotalCashIn())
                .totalCashOut(shift.getTotalCashOut())
                .expectedCash(shift.getExpectedCash())
                .closingCash(shift.getClosingCash())
                .discrepancy(shift.getDiscrepancy())
                .status(shift.getStatus())
                .build();
    }
}
