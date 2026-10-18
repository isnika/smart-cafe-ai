package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.auth.GoogleLoginRequest;
import com.smart_cafe_ai.identity_service.dto.auth.LoginRequest;
import com.smart_cafe_ai.identity_service.exception.GoogleAuthException;
import com.smart_cafe_ai.identity_service.model.*;
import com.smart_cafe_ai.identity_service.repository.*;
import com.smart_cafe_ai.identity_service.security.GoogleIdentity;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GoogleLoginTest {
    private UserRepository users;
    private RoleRepository roles;
    private RefreshTokenRepository refreshTokens;
    private PasswordEncoder passwords;
    private GoogleTokenVerifierService google;
    private AuthService auth;
    private GoogleLoginRequest request;
    private Role customer;
    private JwtService jwt;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        roles = mock(RoleRepository.class);
        refreshTokens = mock(RefreshTokenRepository.class);
        passwords = mock(PasswordEncoder.class);
        google = mock(GoogleTokenVerifierService.class);
        jwt = new JwtService();
        ReflectionTestUtils.setField(jwt, "secretKey", "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970");
        ReflectionTestUtils.setField(jwt, "accessTokenExpirationMs", 900000L);
        ReflectionTestUtils.setField(jwt, "refreshTokenExpirationMs", 604800000L);
        auth = new AuthService(users, roles, refreshTokens, passwords, jwt, mock(OtpService.class), google);
        customer = Role.builder().id(1).name("Customer").build();
        request = new GoogleLoginRequest();
        request.setIdToken("google-token");
        request.setDeviceInfo("Postman");
        when(google.verify("google-token")).thenReturn(identity("customer@gmail.com", true, null));
        when(roles.findByName("Customer")).thenReturn(Optional.of(customer));
        when(users.saveAndFlush(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.ensureIdAndStatus();
            return user;
        });
    }

    @Test
    void createsCustomerAndPersistsOnlyRefreshHashWithDevice() throws Exception {
        var response = auth.googleLogin(request);
        assertTrue(response.isSuccess());
        assertTrue(response.getData().getNewUser());
        assertEquals("Customer", response.getData().getUser().getRoleName());
        assertEquals(UserStatus.Active, response.getData().getUser().getStatus());
        assertTrue(jwt.isTokenValid(response.getData().getAccessToken()));
        ArgumentCaptor<User> user = ArgumentCaptor.forClass(User.class);
        verify(users).saveAndFlush(user.capture());
        assertNull(user.getValue().getPasswordHash());
        assertEquals("google-123", user.getValue().getGoogleId());
        assertNotNull(user.getValue().getEmailVerifiedAt());
        assertNotNull(user.getValue().getLastLoginAt());
        ArgumentCaptor<RefreshToken> token = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(token.capture());
        String expectedHash = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256")
                .digest(response.getData().getRefreshToken().getBytes(StandardCharsets.UTF_8)));
        assertEquals(expectedHash, token.getValue().getTokenHash());
        assertEquals("Postman", token.getValue().getDeviceInfo());
    }

    @Test
    void repeatLoginUsesSubjectAndProducesDistinctRefreshTokens() {
        User user = activeUser();
        when(users.findByGoogleId("google-123")).thenReturn(Optional.of(user));
        // Google email may have changed; the linked subject remains the identity.
        when(google.verify("google-token")).thenReturn(identity("changed@gmail.com", true, null));
        var first = auth.googleLogin(request).getData();
        var second = auth.googleLogin(request).getData();
        assertFalse(first.getNewUser());
        assertEquals("user-1", first.getUser().getId());
        assertNotEquals(first.getRefreshToken(), second.getRefreshToken());
        assertEquals("customer@gmail.com", user.getEmail());
        verify(users, never()).findByEmailIgnoreCase(anyString());
        verifyNoInteractions(roles);
    }

    @Test
    void neverAutoLinksMatchingEmail() {
        User user = activeUser();
        user.setGoogleId(null);
        when(users.findByEmailIgnoreCase("customer@gmail.com")).thenReturn(Optional.of(user));
        assertError("ACCOUNT_LINK_REQUIRED", () -> auth.googleLogin(request));
        assertNull(user.getGoogleId());
        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(refreshTokens);
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Banned", "Deactivated", "Unverified"})
    void rejectsInactiveLinkedAccounts(UserStatus status) {
        User user = activeUser();
        user.setStatus(status);
        when(users.findByGoogleId("google-123")).thenReturn(Optional.of(user));
        var error = assertThrows(GoogleAuthException.class, () -> auth.googleLogin(request));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verifyNoInteractions(refreshTokens);
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void linksGoogleAfterExistingAccountAuthenticationWithoutChangingPasswordOrRole() {
        User user = activeUser();
        user.setGoogleId(null);
        user.setPasswordHash("existing-hash");
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        var response = auth.linkGoogle("user-1", request);
        assertEquals("google-123", user.getGoogleId());
        assertEquals("existing-hash", user.getPasswordHash());
        assertSame(customer, user.getRole());
        assertFalse(response.getData().getNewUser());
    }

    @Test
    void cannotLinkGoogleOwnedByAnotherUser() {
        User user = activeUser();
        user.setGoogleId(null);
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        when(users.findByGoogleId("google-123")).thenReturn(Optional.of(User.builder().id("other").build()));
        assertError("GOOGLE_ACCOUNT_CONFLICT", () -> auth.linkGoogle("user-1", request));
        assertNull(user.getGoogleId());
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void cannotReplaceExistingGoogleLink() {
        User user = activeUser();
        user.setGoogleId("another-google-id");
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        assertError("GOOGLE_ACCOUNT_CONFLICT", () -> auth.linkGoogle("user-1", request));
        assertEquals("another-google-id", user.getGoogleId());
    }

    @Test
    void cannotLinkDifferentEmail() {
        User user = activeUser();
        user.setGoogleId(null);
        user.setEmail("other@gmail.com");
        when(users.findById("user-1")).thenReturn(Optional.of(user));
        assertError("GOOGLE_EMAIL_MISMATCH", () -> auth.linkGoogle("user-1", request));
        assertNull(user.getGoogleId());
    }

    @Test
    void unverifiedGoogleEmailCannotRegister() {
        when(google.verify("google-token")).thenReturn(identity("customer@gmail.com", false, null));
        assertError("GOOGLE_EMAIL_INVALID", () -> auth.googleLogin(request));
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void thirdPartyEmailRequiresOwnOtpBeforeRegistration() {
        when(google.verify("google-token")).thenReturn(identity("customer@example.com", true, null));
        assertError("GOOGLE_EMAIL_VERIFICATION_REQUIRED", () -> auth.googleLogin(request));
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void verifiedWorkspaceEmailCanRegister() {
        when(google.verify("google-token")).thenReturn(identity("customer@company.example", true, "company.example"));
        assertTrue(auth.googleLogin(request).getData().getNewUser());
    }

    @Test
    void invalidTokenNeverAccessesUserDatabase() {
        when(google.verify("google-token")).thenThrow(new GoogleAuthException(HttpStatus.UNAUTHORIZED,
                "GOOGLE_TOKEN_INVALID", "Invalid"));
        assertError("GOOGLE_TOKEN_INVALID", () -> auth.googleLogin(request));
        verify(users, never()).findByGoogleId(anyString());
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void rejectsMissingBodyAndOversizedDeviceInfo() {
        assertError("VALIDATION_ERROR", () -> auth.googleLogin(null));
        request.setDeviceInfo("x".repeat(256));
        assertError("VALIDATION_ERROR", () -> auth.googleLogin(request));
        verifyNoInteractions(google, refreshTokens);
    }

    @Test
    void googleOnlyUserCannotLoginWithPassword() {
        when(users.findByIdentifier("customer@gmail.com")).thenReturn(Optional.of(activeUser()));
        LoginRequest login = new LoginRequest();
        login.setIdentifier("customer@gmail.com");
        login.setPassword("anything");
        assertFalse(auth.login(login).isSuccess());
        verifyNoInteractions(passwords, refreshTokens);
    }

    private User activeUser() {
        return User.builder().id("user-1").googleId("google-123").email("customer@gmail.com")
                .fullName("Customer").role(customer).status(UserStatus.Active).build();
    }

    private GoogleIdentity identity(String email, boolean verified, String hostedDomain) {
        return new GoogleIdentity("google-123", email, verified, "Customer",
                "https://example.com/avatar.png", hostedDomain);
    }

    private void assertError(String code, org.junit.jupiter.api.function.Executable action) {
        assertEquals(code, assertThrows(GoogleAuthException.class, action).getCode());
    }
}
