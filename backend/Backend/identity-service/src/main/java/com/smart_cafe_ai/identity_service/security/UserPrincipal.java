package com.smart_cafe_ai.identity_service.security;

import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;

@AllArgsConstructor
@Getter
public class UserPrincipal implements UserDetails {

    private final User user;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        if (user.getRole() == null) {
            return Collections.emptyList();
        }
        String roleName = user.getRole().getName();
        if (!roleName.startsWith("ROLE_")) {
            roleName = "ROLE_" + roleName.toUpperCase();
        }
        return Collections.singletonList(new SimpleGrantedAuthority(roleName));
    }

    public String getId() {
        return user.getId();
    }

    public Integer getBranchId() {
        return user.getBranchId();
    }

    public String getRoleName() {
        return user.getRole() != null ? user.getRole().getName() : null;
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
        return user.getStatus() != UserStatus.Banned;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return user.getStatus() == UserStatus.Active;
    }
}
