package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.auth.AuthResponse;
import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ForgotPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.LoginRequest;
import com.smart_cafe_ai.identity_service.dto.auth.GoogleLoginRequest;
import com.smart_cafe_ai.identity_service.exception.GoogleAuthException;
import com.smart_cafe_ai.identity_service.security.GoogleIdentity;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Locale;

@Service
public class AuthService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AuthService.class);
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final OtpService otpService;
    private final GoogleTokenVerifierService googleTokenVerifier;

    public AuthService(UserRepository userRepository, RoleRepository roleRepository, RefreshTokenRepository refreshTokenRepository, PasswordEncoder passwordEncoder, JwtService jwtService, OtpService otpService, GoogleTokenVerifierService googleTokenVerifier) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.otpService = otpService;
        this.googleTokenVerifier = googleTokenVerifier;
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
        String target = request.getEmail() != null && !request.getEmail().isBlank() ? request.getEmail() : request.getPhone();
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
        return ApiResponse.success(issueTokens(user, null));
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
        if (user == null || user.getPasswordHash() == null || user.getPasswordHash().isBlank()
                || request.getPassword() == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
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
        return ApiResponse.success(issueTokens(user, null));
    }

    @Transactional
    public ApiResponse<AuthResponse> googleLogin(GoogleLoginRequest request) {
        validateGoogleRequest(request);
        GoogleIdentity identity = googleTokenVerifier.verify(request.getIdToken());
        User user = userRepository.findByGoogleId(identity.subject()).orElse(null);
        boolean newUser = user == null;
        if (newUser) {
            String email = googleEmail(identity);
            User existingUser = userRepository.findByEmailIgnoreCase(email).orElse(null);
            if (existingUser != null) {
                requireActiveGoogleUser(existingUser);
                throw new GoogleAuthException(HttpStatus.CONFLICT, "ACCOUNT_LINK_REQUIRED",
                        "Email đã có tài khoản. Hãy đăng nhập tài khoản hiện tại và liên kết Google");
            }
            // Non-Google email addresses need our own OTP before they can be trusted as contacts.
            if (!identity.hasAuthoritativeEmail()) {
                throw new GoogleAuthException(HttpStatus.FORBIDDEN, "GOOGLE_EMAIL_VERIFICATION_REQUIRED",
                        "Hãy đăng ký và xác thực email bằng OTP, sau đó đăng nhập để liên kết Google");
            }
            Role customerRole = roleRepository.findByName("Customer").orElseGet(() ->
                    roleRepository.save(Role.builder().name("Customer").description("Default Customer role").build()));
            String name = identity.name() == null || identity.name().isBlank() ? "Google User" : identity.name().trim();
            String picture = identity.picture();
            user = User.builder()
                    .googleId(identity.subject()).email(email)
                    .fullName(name.substring(0, Math.min(name.length(), 100)))
                    .avatar(picture != null && picture.startsWith("https://") && picture.length() <= 255 ? picture : null)
                    .role(customerRole).status(UserStatus.Active).emailVerifiedAt(LocalDateTime.now()).build();
        }
        requireActiveGoogleUser(user);
        user.setLastLoginAt(LocalDateTime.now());
        // Flush unique email/google_id constraints before issuing credentials.
        user = userRepository.saveAndFlush(user);
        AuthResponse response = issueTokens(user, request.getDeviceInfo());
        response.setNewUser(newUser);
        return ApiResponse.success(response);
    }

    @Transactional
    public ApiResponse<AuthResponse> linkGoogle(String userId, GoogleLoginRequest request) {
        validateGoogleRequest(request);
        User user = userRepository.findById(userId).orElseThrow(() ->
                new GoogleAuthException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Tài khoản không tồn tại"));
        requireActiveGoogleUser(user);
        GoogleIdentity identity = googleTokenVerifier.verify(request.getIdToken());
        User owner = userRepository.findByGoogleId(identity.subject()).orElse(null);
        if ((owner != null && !owner.getId().equals(userId))
                || (user.getGoogleId() != null && !user.getGoogleId().equals(identity.subject()))) {
            throw new GoogleAuthException(HttpStatus.CONFLICT, "GOOGLE_ACCOUNT_CONFLICT",
                    "Tài khoản Google đã được liên kết hoặc tài khoản hiện tại đã liên kết Google khác");
        }
        String email = googleEmail(identity);
        if (user.getEmail() == null || !user.getEmail().equalsIgnoreCase(email)) {
            throw new GoogleAuthException(HttpStatus.CONFLICT, "GOOGLE_EMAIL_MISMATCH",
                    "Email Google phải trùng email của tài khoản hiện tại");
        }
        if (!identity.hasAuthoritativeEmail() && user.getEmailVerifiedAt() == null) {
            throw new GoogleAuthException(HttpStatus.FORBIDDEN, "GOOGLE_EMAIL_VERIFICATION_REQUIRED",
                    "Hãy xác thực email tài khoản bằng OTP trước khi liên kết Google");
        }
        user.setGoogleId(identity.subject());
        user.setLastLoginAt(LocalDateTime.now());
        user = userRepository.saveAndFlush(user);
        AuthResponse response = issueTokens(user, request.getDeviceInfo());
        response.setNewUser(false);
        return ApiResponse.success(response);
    }

    private void validateGoogleRequest(GoogleLoginRequest request) {
        if (request == null || request.getIdToken() == null || request.getIdToken().isBlank()
                || request.getIdToken().length() > 16384
                || (request.getDeviceInfo() != null && request.getDeviceInfo().length() > 255)) {
            throw new GoogleAuthException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "id_token là bắt buộc (tối đa 16384 ký tự); device_info tối đa 255 ký tự");
        }
    }

    private String googleEmail(GoogleIdentity identity) {
        if (!identity.emailVerified() || identity.email() == null || identity.email().isBlank()
                || identity.email().length() > 100) {
            throw new GoogleAuthException(HttpStatus.UNAUTHORIZED, "GOOGLE_EMAIL_INVALID",
                    "Tài khoản Google cần có email đã xác minh và dài không quá 100 ký tự");
        }
        return identity.email().trim().toLowerCase(Locale.ROOT);
    }

    private void requireActiveGoogleUser(User user) {
        if (user.getStatus() != UserStatus.Active) {
            String code = user.getStatus() == UserStatus.Banned ? "ACCOUNT_BANNED"
                    : user.getStatus() == UserStatus.Deactivated ? "ACCOUNT_DEACTIVATED" : "ACCOUNT_UNVERIFIED";
            throw new GoogleAuthException(HttpStatus.FORBIDDEN, code,
                    "Tài khoản chưa xác thực, đã bị khóa hoặc đã bị vô hiệu hóa");
        }
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
        return ApiResponse.success(issueTokens(user, storedToken.getDeviceInfo()));
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
        return ApiResponse.success(target.contains("@")
                ? "Yêu cầu gửi OTP đến email " + target + " đã được tiếp nhận"
                : "OTP đã được tạo cho " + target + "; hiện kiểm tra mã trong log của identity-service");
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

    private AuthResponse issueTokens(User user, String deviceInfo) {
        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String accessToken = jwtService.generateAccessToken(user.getId(), roleName);
        String refreshToken = jwtService.generateRefreshToken(user.getId());
        saveRefreshTokenInDb(user, refreshToken, deviceInfo);
        return AuthResponse.builder().accessToken(accessToken).refreshToken(refreshToken)
                .expiresIn(jwtService.getAccessTokenExpirationMs() / 1000)
                .user(UserResponse.fromEntity(user)).build();
    }

    private void saveRefreshTokenInDb(User user, String refreshTokenStr, String deviceInfo) {
        String tokenHash = hashToken(refreshTokenStr);
        RefreshToken token = RefreshToken.builder().user(user).tokenHash(tokenHash).deviceInfo(deviceInfo).expiresAt(LocalDateTime.now().plusNanos(jwtService.getRefreshTokenExpirationMs() * 1000000L)).build();
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

