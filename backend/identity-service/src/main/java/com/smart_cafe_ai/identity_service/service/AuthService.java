package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.auth.AuthResponse;
import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ForgotPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.LoginRequest;
import com.smart_cafe_ai.identity_service.dto.auth.RefreshTokenRequest;
import com.smart_cafe_ai.identity_service.dto.auth.RegisterRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ResendOtpRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ResetPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.VerifyOtpRequest;
import com.smart_cafe_ai.identity_service.dto.user.UserResponse;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.RefreshToken;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RefreshTokenRepository;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class AuthService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AuthService.class);
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final OtpService otpService;

    public AuthService(UserRepository userRepository, RoleRepository roleRepository, RefreshTokenRepository refreshTokenRepository, PasswordEncoder passwordEncoder, JwtService jwtService, OtpService otpService) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.otpService = otpService;
    }

    @Transactional
    public ApiResponse<UserResponse> register(RegisterRequest request) {
        if (request.getFullName() == null || request.getFullName().isBlank()) {
            return ApiResponse.error("VALIDATION_ERROR", "Họ và tên (fullName) là bắt buộc");
        }
        if ((request.getEmail() == null || request.getEmail().isBlank()) && (request.getPhone() == null || request.getPhone().isBlank())) {
            return ApiResponse.error("VALIDATION_ERROR", "Email hoặc Số điện thoại là bắt buộc");
        }
        if (request.getEmail() != null && !request.getEmail().isBlank() && userRepository.existsByEmail(request.getEmail())) {
            return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
        }
        if (request.getPhone() != null && !request.getPhone().isBlank() && userRepository.existsByPhone(request.getPhone())) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }
        Role customerRole = roleRepository.findByName("Customer").orElseGet(() -> roleRepository.save(Role.builder().name("Customer").description("Default Customer role").build()));
        User user = User.builder().fullName(request.getFullName()).email(request.getEmail()).phone(request.getPhone()).passwordHash(passwordEncoder.encode(request.getPassword())).role(customerRole).status(UserStatus.Unverified).build();
        User savedUser = userRepository.save(user);
        String target = request.getPhone() != null && !request.getPhone().isBlank() ? request.getPhone() : request.getEmail();
        otpService.generateAndSaveOtp(target, OtpPurpose.Register, savedUser.getId(), null);
        return ApiResponse.success(UserResponse.fromEntity(savedUser));
    }

    @Transactional
    public ApiResponse<AuthResponse> verifyOtp(VerifyOtpRequest request) {
        String target = request.getPhoneEmail();
        boolean isValid = otpService.verifyOtp(target, request.getOtpCode(), OtpPurpose.Register);
        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }
        User user = userRepository.findByIdentifier(target).orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        if (user.getStatus() == UserStatus.Unverified) {
            user.setStatus(UserStatus.Active);
        }
        if (target.contains("@")) {
            user.setEmailVerifiedAt(LocalDateTime.now());
        } else {
            user.setPhoneVerifiedAt(LocalDateTime.now());
        }
        user.setLastLoginAt(LocalDateTime.now());
        user = userRepository.save(user);
        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String accessToken = jwtService.generateAccessToken(user.getId(), roleName);
        String refreshTokenStr = jwtService.generateRefreshToken(user.getId());
        saveRefreshTokenInDb(user, refreshTokenStr);
        AuthResponse authResponse = AuthResponse.builder().accessToken(accessToken).refreshToken(refreshTokenStr).expiresIn(jwtService.getAccessTokenExpirationMs() / 1000).user(UserResponse.fromEntity(user)).build();
        return ApiResponse.success(authResponse);
    }

    @Transactional
    public ApiResponse<String> resendOtp(ResendOtpRequest request) {
        String phoneEmail = request.getPhoneEmail();
        User user = userRepository.findByIdentifier(phoneEmail).orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        otpService.generateAndSaveOtp(phoneEmail, OtpPurpose.Register, user.getId(), null);
        return ApiResponse.success("Đã gửi lại mã OTP thành công");
    }

    @Transactional
    public ApiResponse<AuthResponse> login(LoginRequest request) {
        User user = userRepository.findByIdentifier(request.getIdentifier()).orElse(null);
        if (user == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            return ApiResponse.error("UNAUTHORIZED", "Tên đăng nhập hoặc mật khẩu không chính xác");
        }
        if (user.getStatus() == UserStatus.Unverified) {
            return ApiResponse.error("ACCOUNT_UNVERIFIED", "Tài khoản chưa được xác thực OTP");
        }
        if (user.getStatus() == UserStatus.Banned) {
            return ApiResponse.error("ACCOUNT_BANNED", "Tài khoản của bạn đã bị khóa");
        }
        if (user.getStatus() == UserStatus.Deactivated) {
            return ApiResponse.error("ACCOUNT_DEACTIVATED", "Tài khoản của bạn đã bị vô hiệu hóa");
        }
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);
        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String accessToken = jwtService.generateAccessToken(user.getId(), roleName);
        String refreshTokenStr = jwtService.generateRefreshToken(user.getId());
        saveRefreshTokenInDb(user, refreshTokenStr);
        AuthResponse response = AuthResponse.builder().accessToken(accessToken).refreshToken(refreshTokenStr).expiresIn(jwtService.getAccessTokenExpirationMs() / 1000).user(UserResponse.fromEntity(user)).build();
        return ApiResponse.success(response);
    }

    @Transactional
    public ApiResponse<AuthResponse> refreshToken(RefreshTokenRequest request) {
        String refreshTokenStr = request.getRefreshToken();
        if (refreshTokenStr == null || !jwtService.isTokenValid(refreshTokenStr)) {
            return ApiResponse.error("TOKEN_EXPIRED", "Refresh Token không hợp lệ hoặc đã hết hạn");
        }
        String tokenHash = hashToken(refreshTokenStr);
        RefreshToken storedToken = refreshTokenRepository.findByTokenHashAndRevokedAtIsNull(tokenHash).orElse(null);
        if (storedToken == null || storedToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            return ApiResponse.error("TOKEN_EXPIRED", "Refresh Token đã bị thu hồi hoặc đã hết hạn");
        }
        // Revoke current refresh token (rotation)
        storedToken.setRevokedAt(LocalDateTime.now());
        refreshTokenRepository.save(storedToken);
        User user = storedToken.getUser();
        if (user.getStatus() == UserStatus.Banned || user.getStatus() == UserStatus.Deactivated) {
            return ApiResponse.error("ACCOUNT_DISABLED", "Tài khoản đã bị khóa hoặc vô hiệu hóa");
        }
        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String newAccessToken = jwtService.generateAccessToken(user.getId(), roleName);
        String newRefreshTokenStr = jwtService.generateRefreshToken(user.getId());
        saveRefreshTokenInDb(user, newRefreshTokenStr);
        AuthResponse response = AuthResponse.builder().accessToken(newAccessToken).refreshToken(newRefreshTokenStr).expiresIn(jwtService.getAccessTokenExpirationMs() / 1000).user(UserResponse.fromEntity(user)).build();
        return ApiResponse.success(response);
    }

    @Transactional
    public ApiResponse<Void> logout(String refreshTokenStr) {
        if (refreshTokenStr != null && !refreshTokenStr.isBlank()) {
            String tokenHash = hashToken(refreshTokenStr);
            refreshTokenRepository.findByTokenHash(tokenHash).ifPresent(token -> {
                token.setRevokedAt(LocalDateTime.now());
                refreshTokenRepository.save(token);
            });
        }
        return ApiResponse.success(null);
    }

    @Transactional
    public ApiResponse<String> forgotPassword(ForgotPasswordRequest request) {
        String phoneEmail = request.getPhoneEmail() == null ? null : request.getPhoneEmail().trim();
        userRepository.findByIdentifier(phoneEmail).ifPresent(user -> {
            otpService.generateAndSaveOtp(phoneEmail, OtpPurpose.Reset_Password, user.getId(), null);
        });
        log.info("[DEV ONLY] OTP generated for password reset: target={}", phoneEmail);
        return ApiResponse.success("Nếu tài khoản tồn tại, mã OTP đã được gửi đến " + phoneEmail);
    }

    @Transactional
    public ApiResponse<Void> resetPassword(ResetPasswordRequest request) {
        String phoneEmail = request.getPhoneEmail() == null ? null : request.getPhoneEmail().trim();
        boolean isValid = otpService.verifyOtp(phoneEmail, request.getOtpCode(), OtpPurpose.Reset_Password);
        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }
        User user = userRepository.findByIdentifier(phoneEmail).orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        return ApiResponse.success(null);
    }

    @Transactional
    public ApiResponse<String> requestChangePasswordOtp(String userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        String target = getChangePasswordOtpTarget(user);
        if (target == null) {
            return ApiResponse.error("VALIDATION_ERROR", "Tài khoản chưa có email hoặc số điện thoại để nhận OTP");
        }
        otpService.generateAndSaveOtp(target, OtpPurpose.Change_Password, user.getId(), null);
        return ApiResponse.success("OTP đã được tạo cho " + target + "; hiện kiểm tra mã trong log của identity-service");
    }

    @Transactional
    public ApiResponse<Void> changePassword(String userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
            if (request.getCurrentPassword() == null || !passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
                return ApiResponse.error("VALIDATION_ERROR", "Mật khẩu hiện tại không đúng");
            }
        }
        String otpTarget = getChangePasswordOtpTarget(user);
        if (otpTarget == null || !otpService.verifyOtp(otpTarget, request.getOtpCode(), OtpPurpose.Change_Password)) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        return ApiResponse.success(null);
    }

    private String getChangePasswordOtpTarget(User user) {
        if (user.getEmail() != null && !user.getEmail().isBlank() && user.getEmailVerifiedAt() != null) {
            return user.getEmail().trim();
        }
        if (user.getPhone() != null && !user.getPhone().isBlank() && user.getPhoneVerifiedAt() != null) {
            return user.getPhone().trim();
        }
        if (user.getEmail() != null && !user.getEmail().isBlank()) {
            return user.getEmail().trim();
        }
        if (user.getPhone() != null && !user.getPhone().isBlank()) {
            return user.getPhone().trim();
        }
        return null;
    }

    private void saveRefreshTokenInDb(User user, String refreshTokenStr) {
        String tokenHash = hashToken(refreshTokenStr);
        RefreshToken token = RefreshToken.builder().user(user).tokenHash(tokenHash).expiresAt(LocalDateTime.now().plusNanos(jwtService.getRefreshTokenExpirationMs() * 1000000L)).build();
        refreshTokenRepository.save(token);
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Error hashing token", e);
        }
    }
}

