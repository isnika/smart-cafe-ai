package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminUserBranchApiTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository userRepository;
    @Autowired RoleRepository roleRepository;
    @Autowired JwtService jwtService;
    @Autowired PasswordEncoder passwordEncoder;
    @MockBean GoogleTokenVerifierService google;

    private Role adminRole;
    private Role staffRole;
    private User adminUser;
    private User staffUser;
    private String adminToken;

    @BeforeEach
    void setup() {
        adminRole = roleRepository.findByName("ROLE_ADMIN")
                .orElseGet(() -> roleRepository.save(Role.builder().name("ROLE_ADMIN").description("Admin").build()));
        staffRole = roleRepository.findByName("ROLE_STAFF")
                .orElseGet(() -> roleRepository.save(Role.builder().name("ROLE_STAFF").description("Staff").build()));

        adminUser = userRepository.save(User.builder()
                .email("admin-branch-test@smartcafe.vn")
                .fullName("Admin Test")
                .passwordHash(passwordEncoder.encode("123456"))
                .role(adminRole)
                .status(UserStatus.Active)
                .build());

        staffUser = userRepository.save(User.builder()
                .email("staff-branch-test@smartcafe.vn")
                .fullName("Staff Test")
                .passwordHash(passwordEncoder.encode("123456"))
                .role(staffRole)
                .branchId(1)
                .status(UserStatus.Active)
                .build());

        adminToken = "Bearer " + jwtService.generateAccessToken(adminUser.getId(), "ROLE_ADMIN");
    }

    @Test
    void adminCanUpdateUserBranchViaPatch() throws Exception {
        var res = mvc.perform(patch("/admin/users/" + staffUser.getId() + "/branch")
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"branch_id\": 2}"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = mapper.readTree(res.getResponse().getContentAsString()).path("data");
        assertThat(data.path("branch_id").asInt()).isEqualTo(2);

        User reloaded = userRepository.findById(staffUser.getId()).orElseThrow();
        assertThat(reloaded.getBranchId()).isEqualTo(2);
    }

    @Test
    void adminCanUpdateUserBranchViaPut() throws Exception {
        var res = mvc.perform(put("/admin/users/" + staffUser.getId())
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"full_name\": \"Staff Updated\", \"branch_id\": 3}"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = mapper.readTree(res.getResponse().getContentAsString()).path("data");
        assertThat(data.path("branch_id").asInt()).isEqualTo(3);
        assertThat(data.path("full_name").asText()).isEqualTo("Staff Updated");
    }

    @Test
    void loginIncludesBranchIdInTokenClaimsAndResponseBody() throws Exception {
        var res = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\": \"staff-branch-test@smartcafe.vn\", \"password\": \"123456\"}"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = mapper.readTree(res.getResponse().getContentAsString()).path("data");
        String accessToken = body.path("access_token").asText();
        assertThat(accessToken).isNotBlank();

        // Check response body user.branch_id
        assertThat(body.path("user").path("branch_id").asInt()).isEqualTo(1);

        // Check JWT token claim branch_id
        Integer tokenBranchId = jwtService.extractBranchId(accessToken);
        assertThat(tokenBranchId).isEqualTo(1);
    }
}
