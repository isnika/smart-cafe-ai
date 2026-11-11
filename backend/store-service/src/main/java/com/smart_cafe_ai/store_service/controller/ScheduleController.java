package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleBulkRequest;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleBulkResponse;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleRequest;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleResponse;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import com.smart_cafe_ai.store_service.service.ScheduleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/schedules", "/api/v1/schedules"})
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleService scheduleService;

    /**
     * GET /schedules
     * Lịch theo chi nhánh/nhân viên/ngày. (Manager, Admin)
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<ScheduleResponse>>> getSchedules(
            @RequestParam(value = "branch_id", required = false) Integer branchId,
            @RequestParam(value = "staff_id", required = false) Long staffId,
            @RequestParam(value = "shift_id", required = false) Integer shiftId,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(value = "status", required = false) ScheduleStatus status
    ) {
        List<ScheduleResponse> schedules = scheduleService.getSchedules(branchId, staffId, shiftId, from, to, status);
        return ResponseEntity.ok(ApiResponse.success(schedules));
    }

    /**
     * GET /schedules/me
     * Nhân viên xem lịch của mình. (Staff/Manager/Admin)
     */
    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('STAFF', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<ScheduleResponse>>> getMySchedules(
            Authentication authentication,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        List<ScheduleResponse> schedules = scheduleService.getMySchedules(userId, from, to);
        return ResponseEntity.ok(ApiResponse.success(schedules));
    }

    /**
     * POST /schedules
     * Xếp lịch một nhân viên. (Manager, Admin)
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ScheduleResponse>> createSchedule(@Valid @RequestBody ScheduleRequest request) {
        ScheduleResponse created = scheduleService.createSchedule(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    /**
     * POST /schedules/bulk
     * Xếp lịch hàng loạt. (Manager, Admin)
     */
    @PostMapping("/bulk")
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ScheduleBulkResponse>> createSchedulesBulk(@Valid @RequestBody ScheduleBulkRequest request) {
        ScheduleBulkResponse result = scheduleService.createSchedulesBulk(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(result));
    }

    /**
     * PUT /schedules/{id}
     * Đổi ca/ngày cho schedule. (Manager, Admin)
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ScheduleResponse>> updateSchedule(
            @PathVariable Long id,
            @Valid @RequestBody ScheduleRequest request
    ) {
        ScheduleResponse updated = scheduleService.updateSchedule(id, request);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * PATCH /schedules/{id}/status
     * Cập nhật trạng thái lịch. (Manager, Admin)
     */
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<ScheduleResponse>> updateScheduleStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        String statusStr = body.get("status");
        ScheduleStatus status = ScheduleStatus.valueOf(statusStr);
        ScheduleResponse updated = scheduleService.updateScheduleStatus(id, status);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * DELETE /schedules/{id}
     * Xóa lịch tương lai chưa có chấm công. (Manager, Admin)
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public ResponseEntity<Void> deleteSchedule(@PathVariable Long id) {
        scheduleService.deleteSchedule(id);
        return ResponseEntity.noContent().build();
    }
}
