package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.*;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ManagerStaffService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public ApiResponse<List<UserResponse>> getStaffList(Integer managerBranchId, String query, UserStatus status, Pageable pageable) {
        Specification<User> spec = (root, q, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("role").get("name"), "Staff"));

            if (managerBranchId != null) {
                predicates.add(cb.equal(root.get("branchId"), managerBranchId));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (query != null && !query.isBlank()) {
                String search = "%" + query.toLowerCase() + "%";
                Predicate nameLike = cb.like(cb.lower(root.get("fullName")), search);
                Predicate emailLike = cb.like(cb.lower(root.get("email")), search);
                Predicate phoneLike = cb.like(cb.lower(root.get("phone")), search);
                predicates.add(cb.or(nameLike, emailLike, phoneLike));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<User> pageResult = userRepository.findAll(spec, pageable);
        List<UserResponse> list = pageResult.getContent().stream().map(UserResponse::fromEntity).toList();

        PageMeta meta = PageMeta.builder()
                .page(pageable.getPageNumber() + 1)
                .size(pageable.getPageSize())
                .totalItems(pageResult.getTotalElements())
                .totalPages(pageResult.getTotalPages())
                .build();

        return ApiResponse.success(list, meta);
    }

    @Transactional
    public ApiResponse<UserResponse> createStaff(Integer managerBranchId, StaffCreateRequest request) {
        if (request.getEmail() != null && userRepository.existsByEmail(request.getEmail())) {
            return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
        }
        if (request.getPhone() != null && userRepository.existsByPhone(request.getPhone())) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }

        Role staffRole = roleRepository.findByName("Staff")
                .orElseGet(() -> roleRepository.save(Role.builder().name("Staff").description("Staff role").build()));

        Integer branchId = request.getBranchId() != null ? request.getBranchId() : managerBranchId;

        User staff = User.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .phone(request.getPhone())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .avatar(request.getAvatar())
                .role(staffRole)
                .branchId(branchId)
                .status(UserStatus.Active) // Staff is Active immediately
                .build();

        User savedStaff = userRepository.save(staff);
        return ApiResponse.success(UserResponse.fromEntity(savedStaff));
    }

    @Transactional(readOnly = true)
    public ApiResponse<UserResponse> getStaffById(String staffId) {
        User staff = userRepository.findById(staffId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy nhân viên"));
        return ApiResponse.success(UserResponse.fromEntity(staff));
    }

    @Transactional
    public ApiResponse<UserResponse> updateStaff(String staffId, StaffUpdateRequest request) {
        User staff = userRepository.findById(staffId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy nhân viên"));

        if (request.getFullName() != null) staff.setFullName(request.getFullName());
        if (request.getEmail() != null) staff.setEmail(request.getEmail());
        if (request.getPhone() != null) staff.setPhone(request.getPhone());
        if (request.getAvatar() != null) staff.setAvatar(request.getAvatar());
        if (request.getBranchId() != null) staff.setBranchId(request.getBranchId());

        User updated = userRepository.save(staff);
        return ApiResponse.success(UserResponse.fromEntity(updated));
    }

    @Transactional
    public ApiResponse<UserResponse> updateStaffStatus(String staffId, UserStatus status) {
        User staff = userRepository.findById(staffId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy nhân viên"));

        staff.setStatus(status);
        User updated = userRepository.save(staff);
        return ApiResponse.success(UserResponse.fromEntity(updated));
    }
}
