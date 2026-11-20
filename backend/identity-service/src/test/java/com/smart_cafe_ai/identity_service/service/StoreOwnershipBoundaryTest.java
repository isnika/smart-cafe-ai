package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.controller.ManagerStaffController;
import com.smart_cafe_ai.identity_service.dto.admin.*;
import com.smart_cafe_ai.identity_service.exception.ApiException;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class StoreOwnershipBoundaryTest {

    @Test
    void adminCanAssignAndFilterBranchId() {
        var users = mock(UserRepository.class);
        var roles = mock(RoleRepository.class);
        var encoder = mock(PasswordEncoder.class);
        var service = new AdminUserService(users, roles, encoder, mock(UserStatusEvents.class));

        when(roles.findByName(any())).thenReturn(Optional.of(Role.builder().id(1).name("ROLE_CUSTOMER").build()));
        when(roles.findById(any())).thenReturn(Optional.of(Role.builder().id(1).name("ROLE_CUSTOMER").build()));
        when(users.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(users.findById(any())).thenReturn(Optional.of(User.builder().id("user-id").role(Role.builder().id(1).name("ROLE_CUSTOMER").build()).build()));
        when(users.findAll(any(Specification.class), any(PageRequest.class))).thenReturn(new PageImpl<>(List.of()));

        var create = new AdminUserCreateRequest();
        create.setBranchId(1);
        create.setPassword("123456");
        create.setFullName("Test User");
        var resCreate = service.createUser(create);
        assertEquals(1, resCreate.getData().getBranchId());

        var role = new AdminUserRoleRequest();
        role.setBranchId(2);
        role.setRoleId(1);
        var resRole = service.updateUserRole("user-id", role);
        assertEquals(2, resRole.getData().getBranchId());

        var resGetAll = service.getAllUsers(null, 1, null, null, PageRequest.of(0, 20));
        assertNotNull(resGetAll);
    }

    @Test
    void legacyManagerStaffRoutesAreBlockedUntilStoreAuthorizationExists() {
        var staff = mock(ManagerStaffService.class);
        var controller = new ManagerStaffController(staff);
        assertEquals(503, assertThrows(ApiException.class, controller::requireStoreStaffIntegration).getStatus().value());
        verifyNoInteractions(staff);
    }
}
