package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestCreateRequest;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestDecisionRequest;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestResponse;
import com.smart_cafe_ai.store_service.enums.LeaveStatus;

import java.util.List;

public interface LeaveRequestService {
    LeaveRequestResponse createLeaveRequest(String userId, LeaveRequestCreateRequest request);
    List<LeaveRequestResponse> getMyLeaveRequests(String userId, LeaveStatus status);
    LeaveRequestResponse cancelLeaveRequest(Long id, String userId);
    List<LeaveRequestResponse> getLeaveRequests(Integer branchId, Long staffId, LeaveStatus status);
    LeaveRequestResponse decideLeaveRequest(Long id, String approverUserId, LeaveRequestDecisionRequest request);
}
