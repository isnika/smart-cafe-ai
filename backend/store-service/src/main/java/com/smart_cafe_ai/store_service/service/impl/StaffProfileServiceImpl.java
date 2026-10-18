package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.client.IdentityServiceClient;
import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.identity.UserInfo;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileRequest;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.entity.StaffBranchHistory;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.enums.StaffEmploymentType;
import com.smart_cafe_ai.store_service.enums.StaffStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.BranchRepository;
import com.smart_cafe_ai.store_service.repository.StaffBranchHistoryRepository;
import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import com.smart_cafe_ai.store_service.service.StaffProfileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StaffProfileServiceImpl implements StaffProfileService {

    private final StaffProfileRepository staffProfileRepository;
    private final BranchRepository branchRepository;
    private final StaffBranchHistoryRepository staffBranchHistoryRepository;
    private final IdentityServiceClient identityServiceClient;

    @Override
    @Transactional(readOnly = true)
    public List<StaffProfileResponse> getStaffProfiles(Integer branchId, StaffStatus status) {
        List<StaffProfile> profiles;
        if (branchId != null && status != null) {
            profiles = staffProfileRepository.findAllByBranchIdAndStatus(branchId, status);
        } else if (branchId != null) {
            profiles = staffProfileRepository.findAllByBranchId(branchId);
        } else {
            profiles = staffProfileRepository.findAll();
        }

        return profiles.stream()
                .map(StaffProfileResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public StaffProfileResponse getStaffProfileById(Long id, String bearerToken) {
        StaffProfile profile = staffProfileRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên", id));

        StaffProfileResponse response = StaffProfileResponse.fromEntity(profile);

        // Gọi identity-service qua OpenFeign để kết nối dữ liệu user nếu có bearerToken
        if (bearerToken != null && !bearerToken.isBlank()) {
            try {
                ApiResponse<UserInfo> userApiResponse = identityServiceClient.getUserById(profile.getUserId(), bearerToken);
                if (userApiResponse != null && userApiResponse.isSuccess()) {
                    response.setUserInfo(userApiResponse.getData());
                }
            } catch (Exception e) {
                log.warn("Không thể gọi identity-service lấy thông tin user_id={}: {}", profile.getUserId(), e.getMessage());
            }
        }

        return response;
    }

    @Override
    @Transactional
    public StaffProfileResponse createStaffProfile(StaffProfileRequest request, String bearerToken) {
        if (staffProfileRepository.existsByUserId(request.getUserId())) {
            throw new BusinessException("STAFF_USER_EXISTS", "User này đã có hồ sơ nhân viên");
        }
        if (staffProfileRepository.existsByEmployeeCode(request.getEmployeeCode())) {
            throw new BusinessException("EMPLOYEE_CODE_EXISTS", "Mã nhân viên '" + request.getEmployeeCode() + "' đã tồn tại");
        }

        Branch branch = branchRepository.findById(request.getBranchId())
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", request.getBranchId()));

        StaffProfile profile = StaffProfile.builder()
                .userId(request.getUserId())
                .branch(branch)
                .employeeCode(request.getEmployeeCode())
                .jobTitle(request.getJobTitle())
                .employmentType(request.getEmploymentType() != null ? request.getEmploymentType() : StaffEmploymentType.Full_Time)
                .hireDate(request.getHireDate())
                .status(StaffStatus.Active)
                .build();

        StaffProfile saved = staffProfileRepository.save(profile);
        return getStaffProfileById(saved.getId(), bearerToken);
    }

    @Override
    @Transactional
    public StaffProfileResponse updateStaffProfile(Long id, com.smart_cafe_ai.store_service.dto.staff.StaffProfileUpdateRequest request) {
        StaffProfile profile = staffProfileRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên", id));

        profile.setJobTitle(request.getJobTitle());
        profile.setEmploymentType(request.getEmploymentType());
        profile.setHireDate(request.getHireDate());

        StaffProfile saved = staffProfileRepository.save(profile);
        return StaffProfileResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public StaffProfileResponse updateStaffStatus(Long id, StaffStatus status, LocalDate terminationDate) {
        StaffProfile profile = staffProfileRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên", id));

        profile.setStatus(status);
        if (status == StaffStatus.Terminated) {
            profile.setTerminationDate(terminationDate != null ? terminationDate : LocalDate.now());
        }

        StaffProfile saved = staffProfileRepository.save(profile);
        return StaffProfileResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public StaffProfileResponse transferBranch(Long id, Integer toBranchId, LocalDate effectiveDate, String note, String changedBy) {
        StaffProfile profile = staffProfileRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên", id));

        Branch toBranch = branchRepository.findById(toBranchId)
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh đích", toBranchId));

        Branch fromBranch = profile.getBranch();

        // Ghi lịch sử chuyển chi nhánh
        StaffBranchHistory history = StaffBranchHistory.builder()
                .staff(profile)
                .fromBranch(fromBranch)
                .toBranch(toBranch)
                .effectiveDate(effectiveDate != null ? effectiveDate : LocalDate.now())
                .changedBy(changedBy)
                .note(note)
                .build();
        staffBranchHistoryRepository.save(history);

        // Đổi branch của nhân viên
        profile.setBranch(toBranch);
        StaffProfile saved = staffProfileRepository.save(profile);
        return StaffProfileResponse.fromEntity(saved);
    }
}
