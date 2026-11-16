package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.shift.ShiftRequest;
import com.smart_cafe_ai.store_service.dto.shift.ShiftResponse;

import java.util.List;

public interface ShiftService {
    List<ShiftResponse> getShifts(Integer branchId, Boolean isActive);
    ShiftResponse getShiftById(Integer id);
    ShiftResponse createShift(ShiftRequest request);
    ShiftResponse updateShift(Integer id, ShiftRequest request);
    ShiftResponse updateShiftActive(Integer id, Boolean isActive);
}
