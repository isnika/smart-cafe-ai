package com.smart_cafe_ai.identity_service.security;

import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import java.util.Collection;
import java.util.Collections;

public class UserPrincipal implements UserDetails {
    private final User user;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        String roleName = (user.getRole() != null && user.getRole().getName() != null && !user.getRole().getName().isBlank())
                ? user.getRole().getName()
                : "ROLE_CUSTOMER";
        if (!roleName.startsWith("ROLE_")) {
            roleName = "ROLE_" + roleName.toUpperCase();
        }
        return Collections.singletonList(new SimpleGrantedAuthority(roleName));
    }

    public String getId() {
        return user.getId();
    }

    public Integer getBranchId() {
        return null;
    }

    public String getRoleName() {
        if (user.getRole() != null && user.getRole().getName() != null && !user.getRole().getName().isBlank()) {
            String roleName = user.getRole().getName();
            return roleName.startsWith("ROLE_") ? roleName : "ROLE_" + roleName.toUpperCase();
        }
        return "ROLE_CUSTOMER";
    }

    @Override
    public String getPassword() {
        return user.getPasswordHash();
    }

    @Override
    public String getUsername() {
        return user.getId();
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return user.getStatus() != UserStatus.Banned && user.getStatus() != UserStatus.Deactivated;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return user.getStatus() == UserStatus.Active;
    }
    public UserPrincipal(final User user) {
        this.user = user;
    }
    public User getUser() {
        return this.user;
    }
}

