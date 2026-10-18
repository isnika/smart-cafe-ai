package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileRequest;
import com.smart_cafe_ai.store_service.dto.staff.StaffProfileResponse;
import com.smart_cafe_ai.store_service.entity.StaffBranchHistory;
import com.smart_cafe_ai.store_service.enums.StaffStatus;
import com.smart_cafe_ai.store_service.repository.StaffBranchHistoryRepository;
import com.smart_cafe_ai.store_service.service.StaffProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/staff-profiles", "/api/v1/staff-profiles"})
@RequiredArgsConstructor
public class StaffProfileController {

    private final StaffProfileService staffProfileService;
    private final StaffBranchHistoryRepository staffBranchHistoryRepository;

    /**
     * GET /staff-profiles
     * Danh sách hồ sơ nhân viên theo chi nhánh. (Manager/Admin)
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<StaffProfileResponse>>> getStaffProfiles(
            @RequestParam(value = "branch_id", required = false) Integer branchId,
            @RequestParam(value = "status", required = false) StaffStatus status
    ) {
        List<StaffProfileResponse> profiles = staffProfileService.getStaffProfiles(branchId, status);
        return ResponseEntity.ok(ApiResponse.success(profiles));
    }

    /**
     * GET /staff-profiles/{id}
     * Chi tiết hồ sơ nhân viên (có tích hợp lấy thông tin user qua OpenFeign). (Manager/Admin)
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<StaffProfileResponse>> getStaffProfileById(
            @PathVariable Long id,
            @RequestHeader(value = "Authorization", required = false) String bearerToken
    ) {
        StaffProfileResponse profile = staffProfileService.getStaffProfileById(id, bearerToken);
        return ResponseEntity.ok(ApiResponse.success(profile));
    }

    /**
     * POST /staff-profiles
     * Tạo hồ sơ nhân viên mới. (Manager/Admin)
     */
    @PostMapping
    public ResponseEntity<ApiResponse<StaffProfileResponse>> createStaffProfile(
            @Valid @RequestBody StaffProfileRequest request,
            @RequestHeader(value = "Authorization", required = false) String bearerToken
    ) {
        StaffProfileResponse created = staffProfileService.createStaffProfile(request, bearerToken);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created));
    }

    /**
     * PUT /staff-profiles/{id}
     * Cập nhật hồ sơ công việc. (Manager/Admin)
     */
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<StaffProfileResponse>> updateStaffProfile(
            @PathVariable Long id,
            @Valid @RequestBody com.smart_cafe_ai.store_service.dto.staff.StaffProfileUpdateRequest request
    ) {
        StaffProfileResponse updated = staffProfileService.updateStaffProfile(id, request);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * PATCH /staff-profiles/{id}/status
     * Cập nhật trạng thái nhân sự. (Manager/Admin)
     */
    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<StaffProfileResponse>> updateStaffStatus(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        String statusStr = (String) body.get("status");
        StaffStatus status = StaffStatus.valueOf(statusStr);
        String termDateStr = (String) body.get("termination_date");
        LocalDate termDate = termDateStr != null ? LocalDate.parse(termDateStr) : null;

        StaffProfileResponse updated = staffProfileService.updateStaffStatus(id, status, termDate);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * POST /staff-profiles/{id}/transfer
     * Điều chuyển nhân viên sang chi nhánh khác. (Manager/Admin)
     */
    @PostMapping("/{id}/transfer")
    public ResponseEntity<ApiResponse<StaffProfileResponse>> transferBranch(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            Authentication authentication
    ) {
        Integer toBranchId = (Integer) body.get("to_branch_id");
        String effectiveDateStr = (String) body.get("effective_date");
        LocalDate effectiveDate = effectiveDateStr != null ? LocalDate.parse(effectiveDateStr) : LocalDate.now();
        String note = (String) body.get("note");
        String changedBy = authentication != null ? authentication.getName() : "system";

        StaffProfileResponse updated = staffProfileService.transferBranch(id, toBranchId, effectiveDate, note, changedBy);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    /**
     * GET /staff-profiles/{id}/branch-history
     * Lịch sử chuyển chi nhánh của nhân viên. (Manager/Admin)
     */
    @GetMapping("/{id}/branch-history")
    public ResponseEntity<ApiResponse<List<StaffBranchHistory>>> getBranchHistory(@PathVariable Long id) {
        List<StaffBranchHistory> history = staffBranchHistoryRepository.findAllByStaffIdOrderByEffectiveDateDesc(id);
        return ResponseEntity.ok(ApiResponse.success(history));
    }
}
