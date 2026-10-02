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
public class AdminUserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public ApiResponse<List<UserResponse>> getAllUsers(Integer roleId, Integer branchId, UserStatus status, String query, Pageable pageable) {
        Specification<User> spec = (root, q, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (roleId != null) {
                predicates.add(cb.equal(root.get("role").get("id"), roleId));
            }
            if (branchId != null) {
                predicates.add(cb.equal(root.get("branchId"), branchId));
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

    @Transactional(readOnly = true)
    public ApiResponse<UserResponse> getUserById(String id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy tài khoản"));
        return ApiResponse.success(UserResponse.fromEntity(user));
    }

    @Transactional
    public ApiResponse<UserResponse> createUser(AdminUserCreateRequest request) {
        if (request.getEmail() != null && userRepository.existsByEmail(request.getEmail())) {
            return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
        }
        if (request.getPhone() != null && userRepository.existsByPhone(request.getPhone())) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }

        Role role = roleRepository.findById(request.getRoleId())
                .orElseThrow(() -> new RuntimeException("Không tìm thấy vai trò"));

        User user = User.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .phone(request.getPhone())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(role)
                .branchId(request.getBranchId())
                .status(request.getStatus() != null ? request.getStatus() : UserStatus.Active)
                .build();

        User savedUser = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(savedUser));
    }

    @Transactional
    public ApiResponse<UserResponse> updateUser(String id, AdminUserUpdateRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy tài khoản"));

        if (request.getFullName() != null) user.setFullName(request.getFullName());
        if (request.getEmail() != null) user.setEmail(request.getEmail());
        if (request.getPhone() != null) user.setPhone(request.getPhone());
        if (request.getAvatar() != null) user.setAvatar(request.getAvatar());

        User updated = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(updated));
    }

    @Transactional
    public ApiResponse<UserResponse> updateUserRole(String id, AdminUserRoleRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy tài khoản"));

        Role role = roleRepository.findById(request.getRoleId())
                .orElseThrow(() -> new RuntimeException("Không tìm thấy vai trò"));

        user.setRole(role);
        if (request.getBranchId() != null) {
            user.setBranchId(request.getBranchId());
        }

        User updated = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(updated));
    }

    @Transactional
    public ApiResponse<UserResponse> updateUserStatus(String id, UserStatus status) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy tài khoản"));

        user.setStatus(status);
        User updated = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(updated));
    }

    @Transactional
    public ApiResponse<Void> resetUserPassword(String id, String newPassword) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy tài khoản"));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        return ApiResponse.success(null);
    }
}
