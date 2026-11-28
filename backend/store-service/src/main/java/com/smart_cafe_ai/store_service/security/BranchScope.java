package com.smart_cafe_ai.store_service.security;

import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class BranchScope {
    private final StaffProfileRepository profiles;

    public Integer restrict(Integer requested) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) throw new AccessDeniedException("Authentication required");
        if (auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) return requested;
        if (auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_MANAGER"))) {
            Integer branch = profiles.findByUserId(auth.getName())
                    .filter(p -> p.getStatus() == com.smart_cafe_ai.store_service.enums.StaffStatus.Active)
                    .map(p -> p.getBranch().getId()).orElseThrow(() -> new AccessDeniedException("No active branch"));
            if (requested != null && !branch.equals(requested)) throw new AccessDeniedException("Wrong branch");
            return branch;
        }
        return requested;
    }

    public void check(Integer branch) { restrict(branch); }
}
