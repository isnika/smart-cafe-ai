package com.smart_cafe_ai.identity_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class UserProfileApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired JwtService jwt;
    @Autowired EntityManager entityManager;
    @MockBean GoogleTokenVerifierService google;

    private static final String ORIGINAL_NAME = "Tên hiện tại";
    private static final String ORIGINAL_AVATAR = "https://example.com/original.png";
    private User user;
    private String token;

    @BeforeEach
    void setUp() {
        Role role = roles.findByName("Customer").orElseGet(() -> roles.save(Role.builder().name("Customer").build()));
        user = users.saveAndFlush(User.builder().email("profile-validation@example.com")
                .fullName(ORIGINAL_NAME).avatar(ORIGINAL_AVATAR).passwordHash("unused-hash")
                .role(role).status(UserStatus.Active).build());
        token = jwt.generateAccessToken(user.getId(), "Customer");
    }

    static Stream<Arguments> invalidNames() {
        return Stream.of(
                Arguments.of(null, "bắt buộc"),
                Arguments.of("", "để trống"),
                Arguments.of("   ", "để trống"),
                Arguments.of("\u00a0\u2003\u3000", "để trống"),
                Arguments.of("An".repeat(51), "100 ký tự"),
                Arguments.of("Nguyễn Văn 123", "không chứa số"),
                Arguments.of("12345", "không chứa số"),
                Arguments.of("Nguyễn 😀", "emoji"),
                Arguments.of("<script>alert</script>", "ký tự đặc biệt"),
                Arguments.of("An@Bình", "ký tự đặc biệt"),
                Arguments.of("Nguyễn_Văn_An", "ký tự đặc biệt"),
                Arguments.of("Nguyễn\tAn", "tab"),
                Arguments.of("\nNguyễn An", "xuống dòng"),
                Arguments.of("Nguyễn An\r", "xuống dòng"),
                Arguments.of("Nguyễn\u0000An", "điều khiển/ẩn"),
                Arguments.of("Nguyễn\u200bAn", "điều khiển/ẩn"),
                Arguments.of("Nguyễn\u202eAn", "điều khiển/ẩn"),
                Arguments.of("Nguyễn\u2028An", "xuống dòng"),
                Arguments.of("Nguyễn\u2029An", "xuống dòng"),
                Arguments.of("\u0301An", "ký tự đặc biệt"),
                Arguments.of("-Nguyễn An", "giữa hai phần tên"),
                Arguments.of("Nguyễn An'", "giữa hai phần tên"),
                Arguments.of("Jean--Luc", "không được liên tiếp"),
                Arguments.of("O''Connor", "không được liên tiếp"),
                Arguments.of("O' Connor", "giữa hai phần tên")
        );
    }

    @ParameterizedTest
    @MethodSource("invalidNames")
    void rejectsInvalidNameWithSpecificRuleAndDoesNotChangeProfile(String name, String rule) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("full_name", name);
        body.put("avatar", "https://example.com/replacement.png");
        mvc.perform(put("/api/v1/users/me").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.message", containsString("full_name")))
                .andExpect(jsonPath("$.error.message", containsString(rule)))
                .andExpect(jsonPath("$.data").doesNotExist());
        assertProfileUnchanged();
    }

    static Stream<Arguments> validNames() {
        return Stream.of(
                Arguments.of("Nguyễn Thị Ánh", "Nguyễn Thị Ánh"),
                Arguments.of("  Nguyễn   Văn  An  ", "Nguyễn Văn An"),
                Arguments.of("\u00a0Nguyễn\u2003Văn\u3000An\u00a0", "Nguyễn Văn An"),
                Arguments.of(Normalizer.normalize("Nguyễn Thị Ánh", Normalizer.Form.NFD), "Nguyễn Thị Ánh"),
                Arguments.of("Jean-Luc O'Connor", "Jean-Luc O'Connor"),
                Arguments.of("D’Arcy", "D’Arcy"),
                Arguments.of("An", "An"),
                Arguments.of("Á", "Á"),
                Arguments.of("王小明", "王小明"),
                Arguments.of("Á".repeat(100), "Á".repeat(100)),
                Arguments.of(Normalizer.normalize("Á".repeat(100), Normalizer.Form.NFD), "Á".repeat(100))
        );
    }

    @ParameterizedTest
    @MethodSource("validNames")
    void savesNormalizedUnicodeNameAndReturnsItInProfile(String input, String expected) throws Exception {
        mvc.perform(put("/api/v1/users/me").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("full_name", input))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.full_name").value(expected));
        entityManager.flush();
        entityManager.clear();
        User saved = users.findById(user.getId()).orElseThrow();
        assertEquals(expected, saved.getFullName());
        assertEquals(ORIGINAL_AVATAR, saved.getAvatar());
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.full_name").value(expected));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "null", "{}", "{\"avatar\":\"https://example.com/new.png\"}"})
    void requiresBodyAndFullName(String body) throws Exception {
        mvc.perform(put("/api/v1/users/me").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertProfileUnchanged();
    }

    @Test
    void unversionedProfileRouteAlsoReturnsValidationError() throws Exception {
        mvc.perform(put("/users/me").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"full_name\":\"An123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertProfileUnchanged();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not-a-url", "javascript:alert(1)", "http://example.com/a.png"})
    void rejectsInvalidAvatarUrlBeforeChangingName(String avatar) throws Exception {
        mvc.perform(put("/api/v1/users/me").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("full_name", "Tên mới", "avatar", avatar))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertProfileUnchanged();
    }

    @ParameterizedTest
    @ValueSource(strings = {"123", "true", "false", "[]", "{}"})
    void rejectsNonStringNameWithFieldSpecificError(String value) throws Exception {
        mvc.perform(put("/api/v1/users/me").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"full_name\":" + value + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.message", containsString("full_name phải là chuỗi văn bản")));
        assertProfileUnchanged();
    }

    private void assertProfileUnchanged() {
        entityManager.flush();
        entityManager.clear();
        User saved = users.findById(user.getId()).orElseThrow();
        assertEquals(ORIGINAL_NAME, saved.getFullName());
        assertEquals(ORIGINAL_AVATAR, saved.getAvatar());
    }
}
