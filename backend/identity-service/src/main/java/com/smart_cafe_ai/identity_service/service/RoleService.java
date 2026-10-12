package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.RoleRequest;
import com.smart_cafe_ai.identity_service.dto.RoleResponse;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;

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
        if (roleRepository.findByName(request.getName()).isPresent()) {
            return ApiResponse.error("CONFLICT", "Vai trò này đã tồn tại");
        }

        Role role = Role.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();

        Role savedRole = roleRepository.save(role);
        return ApiResponse.success(RoleResponse.fromEntity(savedRole, 0L));
    }

    @Transactional
    public ApiResponse<RoleResponse> updateRole(Integer id, RoleRequest request) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy vai trò"));

        role.setName(request.getName());
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
        if (List.of("Customer", "Staff", "Manager", "Admin").contains(role.getName())) {
            return ApiResponse.error("CONFLICT", "Không thể xóa các vai trò mặc định của hệ thống");
        }

        roleRepository.delete(role);
        return ApiResponse.success(null);
    }
}
