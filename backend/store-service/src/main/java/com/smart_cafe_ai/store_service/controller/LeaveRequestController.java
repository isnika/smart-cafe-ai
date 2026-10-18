package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestCreateRequest;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestDecisionRequest;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestResponse;
import com.smart_cafe_ai.store_service.enums.LeaveStatus;
import com.smart_cafe_ai.store_service.service.LeaveRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/leave-requests", "/api/v1/leave-requests"})
@RequiredArgsConstructor
public class LeaveRequestController {

    private final LeaveRequestService leaveRequestService;

    /**
     * POST /leave-requests
     * Nhân viên gửi đơn nghỉ. (Staff)
     */
    @PostMapping
    public ResponseEntity<ApiResponse<LeaveRequestResponse>> createLeaveRequest(
            @Valid @RequestBody LeaveRequestCreateRequest request,
            Authentication authentication
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        LeaveRequestResponse response = leaveRequestService.createLeaveRequest(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * GET /leave-requests/me
     * Đơn nghỉ của tôi. (Staff)
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<List<LeaveRequestResponse>>> getMyLeaveRequests(
            Authentication authentication,
            @RequestParam(value = "status", required = false) LeaveStatus status
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        List<LeaveRequestResponse> requests = leaveRequestService.getMyLeaveRequests(userId, status);
        return ResponseEntity.ok(ApiResponse.success(requests));
    }

    /**
     * POST /leave-requests/{id}/cancel
     * Rút đơn nghỉ khi còn Pending. (Staff)
     */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<LeaveRequestResponse>> cancelLeaveRequest(
            @PathVariable Long id,
            Authentication authentication
    ) {
        String userId = authentication != null ? authentication.getName() : null;
        LeaveRequestResponse response = leaveRequestService.cancelLeaveRequest(id, userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * GET /leave-requests
     * Quản lý xem đơn nghỉ. (Manager, Admin)
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<LeaveRequestResponse>>> getLeaveRequests(
            @RequestParam(value = "branch_id", required = false) Integer branchId,
            @RequestParam(value = "staff_id", required = false) Long staffId,
            @RequestParam(value = "status", required = false) LeaveStatus status
    ) {
        List<LeaveRequestResponse> requests = leaveRequestService.getLeaveRequests(branchId, staffId, status);
        return ResponseEntity.ok(ApiResponse.success(requests));
    }

    /**
     * PATCH /leave-requests/{id}/decision
     * Duyệt hoặc từ chối đơn nghỉ. (Manager)
     */
    @PatchMapping("/{id}/decision")
    public ResponseEntity<ApiResponse<LeaveRequestResponse>> decideLeaveRequest(
            @PathVariable Long id,
            @Valid @RequestBody LeaveRequestDecisionRequest request,
            Authentication authentication
    ) {
        String approverUserId = authentication != null ? authentication.getName() : null;
        LeaveRequestResponse response = leaveRequestService.decideLeaveRequest(id, approverUserId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
