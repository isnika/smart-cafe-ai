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
import org.junit.jupiter.params.provider.ValueSource;
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
        auth = new AuthService(users, roles, refreshTokens, passwords, jwt, mock(OtpService.class), google, mock(UserStatusEvents.class));
        customer = Role.builder().id(1).name("ROLE_CUSTOMER").build();
        request = new GoogleLoginRequest();
        request.setIdToken("google-token");
        request.setDeviceInfo("Postman");
        when(google.verify("google-token")).thenReturn(identity("customer@gmail.com", true, null));
        when(roles.findByName("ROLE_CUSTOMER")).thenReturn(Optional.of(customer));
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
        assertEquals("ROLE_CUSTOMER", response.getData().getUser().getRoleName());
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
        verify(users, never()).findByEmailForUpdate(anyString());
        verifyNoInteractions(roles);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROLE_CUSTOMER", "ROLE_STAFF", "ROLE_MANAGER", "ROLE_ADMIN"})
    void matchingEmailLogsIntoExistingAccountAndPreservesPasswordProfileAndRole(String roleName) {
        User user = activeUser();
        user.setGoogleId(null);
        user.setPasswordHash("existing-hash");
        user.setPhone("0901234567");
        user.setAvatar("https://example.com/existing-avatar.png");
        Role role = Role.builder().id(2).name(roleName).build();
        user.setRole(role);
        when(users.findByEmailForUpdate("customer@gmail.com")).thenReturn(Optional.of(user));
        var response = auth.googleLogin(request);
        assertTrue(response.isSuccess());
        assertFalse(response.getData().getNewUser());
        assertEquals("user-1", response.getData().getUser().getId());
        assertEquals(roleName, response.getData().getUser().getRoleName());
        assertEquals("google-123", user.getGoogleId());
        assertEquals("existing-hash", user.getPasswordHash());
        assertEquals("Customer", user.getFullName());
        assertEquals("0901234567", user.getPhone());
        assertEquals("https://example.com/existing-avatar.png", user.getAvatar());
        assertSame(role, user.getRole());
        assertNotNull(user.getEmailVerifiedAt());
        assertNotNull(user.getLastLoginAt());
        verifyNoInteractions(roles);

        when(users.findByIdentifier("customer@gmail.com")).thenReturn(Optional.of(user));
        when(passwords.matches("original-password", "existing-hash")).thenReturn(true);
        LoginRequest login = new LoginRequest();
        login.setIdentifier("customer@gmail.com");
        login.setPassword("original-password");
        var passwordSession = auth.login(login);
        assertTrue(passwordSession.isSuccess());
        assertEquals("user-1", passwordSession.getData().getUser().getId());
    }

    @Test
    void matchingWorkspaceEmailCanAlsoAutoLink() {
        User user = activeUser();
        user.setGoogleId(null);
        user.setEmail("customer@company.example");
        when(google.verify("google-token")).thenReturn(identity(user.getEmail(), true, "company.example"));
        when(users.findByEmailForUpdate(user.getEmail())).thenReturn(Optional.of(user));
        assertFalse(auth.googleLogin(request).getData().getNewUser());
        assertEquals("google-123", user.getGoogleId());
    }

    @Test
    void thirdPartyEmailStillRequiresAuthenticatedLinkEvenIfPreviouslyVerified() {
        User user = activeUser();
        user.setGoogleId(null);
        user.setEmail("customer@example.com");
        user.setEmailVerifiedAt(java.time.LocalDateTime.now());
        when(google.verify("google-token")).thenReturn(identity(user.getEmail(), true, null));
        when(users.findByEmailForUpdate(user.getEmail())).thenReturn(Optional.of(user));
        assertError("ACCOUNT_LINK_REQUIRED", () -> auth.googleLogin(request));
        assertNull(user.getGoogleId());
        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void autoLinkCannotReplaceAnotherGoogleAccount() {
        User user = activeUser();
        user.setGoogleId("another-google-id");
        when(users.findByEmailForUpdate("customer@gmail.com")).thenReturn(Optional.of(user));
        assertError("GOOGLE_ACCOUNT_CONFLICT", () -> auth.googleLogin(request));
        assertEquals("another-google-id", user.getGoogleId());
        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(refreshTokens);
    }

    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"Banned", "Deactivated", "Unverified"})
    void autoLinkCannotBypassExistingAccountStatus(UserStatus status) {
        User user = activeUser();
        user.setGoogleId(null);
        user.setStatus(status);
        when(users.findByEmailForUpdate("customer@gmail.com")).thenReturn(Optional.of(user));
        var error = assertThrows(GoogleAuthException.class, () -> auth.googleLogin(request));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
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
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
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
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        when(users.findByGoogleId("google-123")).thenReturn(Optional.of(User.builder().id("other").build()));
        assertError("GOOGLE_ACCOUNT_CONFLICT", () -> auth.linkGoogle("user-1", request));
        assertNull(user.getGoogleId());
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void cannotReplaceExistingGoogleLink() {
        User user = activeUser();
        user.setGoogleId("another-google-id");
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        assertError("GOOGLE_ACCOUNT_CONFLICT", () -> auth.linkGoogle("user-1", request));
        assertEquals("another-google-id", user.getGoogleId());
    }

    @Test
    void cannotLinkDifferentEmail() {
        User user = activeUser();
        user.setGoogleId(null);
        user.setEmail("other@gmail.com");
        when(users.findByIdForUpdate("user-1")).thenReturn(Optional.of(user));
        assertError("GOOGLE_EMAIL_MISMATCH", () -> auth.linkGoogle("user-1", request));
        assertNull(user.getGoogleId());
    }

    @Test
    void unverifiedGoogleEmailCannotRegister() {
        when(google.verify("google-token")).thenReturn(identity("customer@gmail.com", false, null));
        assertError("GOOGLE_EMAIL_INVALID", () -> auth.googleLogin(request));
        verify(users, never()).findByEmailForUpdate(anyString());
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
