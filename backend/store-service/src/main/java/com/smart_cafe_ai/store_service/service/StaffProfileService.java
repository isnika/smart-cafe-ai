package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.staff.StaffProfileRequest;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileUpdateRequest;
import com.smart_cafe_ai.store_service.enums.StaffStatus;

import java.time.LocalDate;
import java.util.List;

public interface StaffProfileService {

    default List<StaffProfileResponse> getStaffProfiles(Integer branchId, StaffStatus status) {
        return getStaffProfiles(branchId, status, null);
    }

    List<StaffProfileResponse> getStaffProfiles(Integer branchId, StaffStatus status, String bearerToken);

    StaffProfileResponse getStaffProfileById(Long id, String bearerToken);

    StaffProfileResponse createStaffProfile(StaffProfileRequest request, String bearerToken);

    StaffProfileResponse updateStaffProfile(Long id, StaffProfileUpdateRequest request);

    StaffProfileResponse updateStaffStatus(Long id, StaffStatus status, LocalDate terminationDate);

    StaffProfileResponse transferBranch(Long id, Integer toBranchId, LocalDate effectiveDate, String note, String changedBy);
}
