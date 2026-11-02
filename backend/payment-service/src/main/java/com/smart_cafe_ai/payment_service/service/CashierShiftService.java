package com.smart_cafe_ai.payment_service.service;

import com.smart_cafe_ai.payment_service.dto.PageMeta;
import com.smart_cafe_ai.payment_service.dto.shift.*;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface CashierShiftService {

    CashierShiftResponse openShift(OpenShiftRequest request, String staffUserId);

    CashierShiftResponse getCurrentShift(String staffUserId);

    CashierShiftResponse getShiftById(Integer id);

    CashierShiftResponse closeShift(Integer id, CloseShiftRequest request, String staffUserId);

    CashMovementResponse recordCashMovement(Integer shiftId, CashMovementRequest request, String staffUserId);

    List<CashMovementResponse> getCashMovements(Integer shiftId);
}
