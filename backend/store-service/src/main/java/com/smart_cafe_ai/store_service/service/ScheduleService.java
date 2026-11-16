package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.schedule.ScheduleBulkRequest;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleBulkResponse;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleRequest;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleResponse;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;

import java.time.LocalDate;
import java.util.List;

public interface ScheduleService {
    List<ScheduleResponse> getSchedules(Integer branchId, Long staffId, Integer shiftId, LocalDate from, LocalDate to, ScheduleStatus status);
    List<ScheduleResponse> getMySchedules(String userId, LocalDate from, LocalDate to);
    ScheduleResponse createSchedule(ScheduleRequest request);
    ScheduleBulkResponse createSchedulesBulk(ScheduleBulkRequest request);
    ScheduleResponse updateSchedule(Long id, ScheduleRequest request);
    ScheduleResponse updateScheduleStatus(Long id, ScheduleStatus status);
    void deleteSchedule(Long id);
}
