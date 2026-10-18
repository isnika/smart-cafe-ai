package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestCreateRequest;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestDecisionRequest;
import com.smart_cafe_ai.store_service.dto.leaverequest.LeaveRequestResponse;
import com.smart_cafe_ai.store_service.entity.LeaveRequest;
import com.smart_cafe_ai.store_service.entity.Schedule;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.enums.LeaveStatus;
import com.smart_cafe_ai.store_service.enums.LeaveType;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.LeaveRequestRepository;
import com.smart_cafe_ai.store_service.repository.ScheduleRepository;
import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import com.smart_cafe_ai.store_service.service.LeaveRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class LeaveRequestServiceImpl implements LeaveRequestService {

    private final LeaveRequestRepository leaveRequestRepository;
    private final StaffProfileRepository staffProfileRepository;
    private final ScheduleRepository scheduleRepository;

    @Override
    @Transactional
    public LeaveRequestResponse createLeaveRequest(String userId, LeaveRequestCreateRequest request) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên cho tài khoản", userId));

        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw new BusinessException("INVALID_LEAVE_DATES", "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu");
        }

        if (leaveRequestRepository.hasOverlappingLeave(staff.getId(), request.getStartDate(), request.getEndDate())) {
            throw new BusinessException("OVERLAPPING_LEAVE_REQUEST", "Đã có đơn nghỉ phép đang chờ duyệt hoặc đã duyệt trong khoảng thời gian này");
        }

        LeaveRequest leaveRequest = LeaveRequest.builder()
                .staff(staff)
                .leaveType(request.getLeaveType() != null ? request.getLeaveType() : LeaveType.Annual)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .reason(request.getReason())
                .status(LeaveStatus.Pending)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        LeaveRequest saved = leaveRequestRepository.save(leaveRequest);
        return LeaveRequestResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<LeaveRequestResponse> getMyLeaveRequests(String userId, LeaveStatus status) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên cho tài khoản", userId));

        List<LeaveRequest> requests;
        if (status != null) {
            requests = leaveRequestRepository.findAllByStaffIdAndStatus(staff.getId(), status);
        } else {
            requests = leaveRequestRepository.findAllByStaffId(staff.getId());
        }

        return requests.stream()
                .map(LeaveRequestResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public LeaveRequestResponse cancelLeaveRequest(Long id, String userId) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên cho tài khoản", userId));

        LeaveRequest leaveRequest = leaveRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn nghỉ phép", id));

        if (!leaveRequest.getStaff().getId().equals(staff.getId())) {
            throw new BusinessException("FORBIDDEN", "Bạn không có quyền hủy đơn nghỉ của nhân viên khác");
        }

        if (leaveRequest.getStatus() != LeaveStatus.Pending) {
            throw new BusinessException("CANNOT_CANCEL_LEAVE", "Chỉ có thể hủy đơn nghỉ khi đang ở trạng thái Pending");
        }

        leaveRequest.setStatus(LeaveStatus.Cancelled);
        leaveRequest.setUpdatedAt(LocalDateTime.now());
        LeaveRequest saved = leaveRequestRepository.save(leaveRequest);
        return LeaveRequestResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<LeaveRequestResponse> getLeaveRequests(Integer branchId, Long staffId, LeaveStatus status) {
        List<LeaveRequest> requests = leaveRequestRepository.findLeaveRequestsFiltered(branchId, staffId, status);
        return requests.stream()
                .map(LeaveRequestResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public LeaveRequestResponse decideLeaveRequest(Long id, String approverUserId, LeaveRequestDecisionRequest request) {
        LeaveRequest leaveRequest = leaveRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Đơn nghỉ phép", id));

        if (leaveRequest.getStatus() != LeaveStatus.Pending) {
            throw new BusinessException("LEAVE_ALREADY_DECIDED", "Đơn nghỉ này đã được xử lý và không còn ở trạng thái Pending");
        }

        StaffProfile approver = staffProfileRepository.findByUserId(approverUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ quản lý", approverUserId));

        if (approver.getId().equals(leaveRequest.getStaff().getId())) {
            throw new BusinessException("SELF_APPROVAL_NOT_ALLOWED", "Quản lý không thể tự phê duyệt đơn nghỉ phép của chính mình");
        }

        if (request.getStatus() != LeaveStatus.Approved && request.getStatus() != LeaveStatus.Rejected) {
            throw new BusinessException("INVALID_DECISION_STATUS", "Trạng thái phê duyệt phải là Approved hoặc Rejected");
        }

        leaveRequest.setStatus(request.getStatus());
        leaveRequest.setApproverStaff(approver);
        leaveRequest.setReviewedAt(LocalDateTime.now());
        leaveRequest.setUpdatedAt(LocalDateTime.now());

        // APP RULE: Khi duyệt Approved, cập nhật tất cả lịch làm việc trong khoảng sang Leave
        if (request.getStatus() == LeaveStatus.Approved) {
            List<Schedule> matchingSchedules = scheduleRepository.findAllByStaffIdAndWorkDateBetween(
                    leaveRequest.getStaff().getId(), leaveRequest.getStartDate(), leaveRequest.getEndDate()
            );
            for (Schedule schedule : matchingSchedules) {
                schedule.setStatus(ScheduleStatus.Leave);
                scheduleRepository.save(schedule);
            }
        }

        LeaveRequest saved = leaveRequestRepository.save(leaveRequest);
        return LeaveRequestResponse.fromEntity(saved);
    }
}
