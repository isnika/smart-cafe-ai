package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingAdjustmentRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingCheckInRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingCheckOutRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingResponse;

import java.time.LocalDate;
import java.util.List;

public interface TimekeepingService {
    TimekeepingResponse checkIn(String userId, TimekeepingCheckInRequest request);
    TimekeepingResponse checkOut(String userId, TimekeepingCheckOutRequest request);
    List<TimekeepingResponse> getMyTimekeeping(String userId, LocalDate from, LocalDate to);
    List<TimekeepingResponse> getTimekeeping(Integer branchId, Long staffId, LocalDate from, LocalDate to);
    TimekeepingResponse adjustTimekeeping(Long id, String managerUserId, TimekeepingAdjustmentRequest request);
}
