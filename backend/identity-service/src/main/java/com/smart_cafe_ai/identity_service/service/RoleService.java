package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.role.RoleRequest;
import com.smart_cafe_ai.identity_service.dto.role.RoleResponse;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class RoleService {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;

    public RoleService(RoleRepository roleRepository, UserRepository userRepository) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<RoleResponse>> getAllRoles() {
        List<Role> roles = roleRepository.findAll();
        List<RoleResponse> responses = roles.stream().map(role -> {
            long count = userRepository.countByRoleId(role.getId());
            return RoleResponse.fromEntity(role, count);
        }).toList();

        return ApiResponse.success(responses);
    }

    @Transactional
    public ApiResponse<RoleResponse> createRole(RoleRequest request) {
        String roleName = request.getName() != null ? request.getName().trim() : "";
        if (!roleName.toUpperCase().startsWith("ROLE_")) {
            roleName = "ROLE_" + roleName.toUpperCase();
        } else {
            roleName = roleName.toUpperCase();
        }
        if (roleRepository.findByName(roleName).isPresent()) {
            return ApiResponse.error("CONFLICT", "Vai trò này đã tồn tại");
        }

        Role role = Role.builder()
                .name(roleName)
                .description(request.getDescription())
                .build();

        Role savedRole = roleRepository.save(role);
        return ApiResponse.success(RoleResponse.fromEntity(savedRole, 0L));
    }

    @Transactional
    public ApiResponse<RoleResponse> updateRole(Integer id, RoleRequest request) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy vai trò"));

        String roleName = request.getName() != null ? request.getName().trim() : "";
        if (!roleName.toUpperCase().startsWith("ROLE_")) {
            roleName = "ROLE_" + roleName.toUpperCase();
        } else {
            roleName = roleName.toUpperCase();
        }
        role.setName(roleName);
        role.setDescription(request.getDescription());

        Role updatedRole = roleRepository.save(role);
        long count = userRepository.countByRoleId(updatedRole.getId());
        return ApiResponse.success(RoleResponse.fromEntity(updatedRole, count));
    }

    @Transactional
    public ApiResponse<Void> deleteRole(Integer id) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy vai trò"));

        long userCount = userRepository.countByRoleId(id);
        if (userCount > 0) {
            return ApiResponse.error("CONFLICT", "Không thể xóa vai trò đang có người dùng gán vào");
        }

        // System roles protection
        List<String> systemRoles = List.of(
                "ROLE_ADMIN", "ROLE_MANAGER", "ROLE_CASHIER", "ROLE_BARISTA", "ROLE_STAFF", "ROLE_CUSTOMER"
        );
        if (systemRoles.contains(role.getName())) {
            return ApiResponse.error("CONFLICT", "Không thể xóa các vai trò mặc định của hệ thống");
        }

        roleRepository.delete(role);
        return ApiResponse.success(null);
    }
}

