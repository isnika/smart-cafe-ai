package com.smart_cafe_ai.identity_service.security;

import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findById(username)
                .or(() -> userRepository.findByIdentifier(username))
                .orElseThrow(() -> new UsernameNotFoundException("User not found with id/identifier: " + username));
        return new UserPrincipal(user);
    }
}
