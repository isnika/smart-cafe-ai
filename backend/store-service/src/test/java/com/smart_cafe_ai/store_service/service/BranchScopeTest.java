package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import com.smart_cafe_ai.store_service.security.BranchScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BranchScopeTest {
    StaffProfileRepository profiles = mock(StaffProfileRepository.class);
    BranchScope scope = new BranchScope(profiles);

    void signIn(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "user", "token", List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void managerIsRestrictedToProfileBranch() {
        signIn("MANAGER");
        when(profiles.findByUserId("user")).thenReturn(Optional.of(StaffProfile.builder()
                .branch(Branch.builder().id(1).build()).build()));
        assertEquals(1, scope.restrict(null));
        assertEquals(1, scope.restrict(1));
        assertThrows(AccessDeniedException.class, () -> scope.restrict(2));
    }

    @Test void adminCanReadAllBranches() {
        signIn("ADMIN");
        assertNull(scope.restrict(null));
        assertEquals(2, scope.restrict(2));
    }
}
