package com.smart_cafe_ai.identity_service.service;
import com.smart_cafe_ai.identity_service.controller.ManagerStaffController;
import com.smart_cafe_ai.identity_service.dto.admin.*;
import com.smart_cafe_ai.identity_service.exception.ApiException;
import com.smart_cafe_ai.identity_service.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class StoreOwnershipBoundaryTest {
    @Test void identityDoesNotPretendToAssignOrFilterStoreBranches() {
        var users=mock(UserRepository.class);var roles=mock(RoleRepository.class);
        var service=new AdminUserService(users,roles,mock(PasswordEncoder.class));
        var create=new AdminUserCreateRequest();create.setBranchId(1);
        var role=new AdminUserRoleRequest();role.setBranchId(1);
        assertEquals(400,assertThrows(ApiException.class,()->service.createUser(create)).getStatus().value());
        assertEquals(400,assertThrows(ApiException.class,()->service.updateUserRole("user-id",role)).getStatus().value());
        assertEquals(400,assertThrows(ApiException.class,()->service.getAllUsers(null,1,null,null,PageRequest.of(0,20))).getStatus().value());
        verifyNoInteractions(users,roles);
    }
    @Test void legacyManagerStaffRoutesAreBlockedUntilStoreAuthorizationExists() {
        var staff=mock(ManagerStaffService.class);var controller=new ManagerStaffController(staff);
        assertEquals(503,assertThrows(ApiException.class,controller::requireStoreStaffIntegration).getStatus().value());
        verifyNoInteractions(staff);
    }
}
