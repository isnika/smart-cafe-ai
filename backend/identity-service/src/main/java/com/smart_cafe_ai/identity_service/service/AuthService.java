package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.auth.AuthResponse;
import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ForgotPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.LoginRequest;
import com.smart_cafe_ai.identity_service.dto.auth.GoogleLoginRequest;
import com.smart_cafe_ai.identity_service.exception.GoogleAuthException;
import com.smart_cafe_ai.identity_service.exception.OtpLockedException;
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
import static com.smart_cafe_ai.identity_service.validation.ProfileValidation.*;

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
        ApiResponse<String> name = validateFullName(request == null ? null : request.getFullName());
        if (!name.isSuccess()) return ApiResponse.error(name.getError().getCode(), name.getError().getMessage());
        String email = normalizeEmail(request.getEmail());
        String phone = normalizePhone(request.getPhone());
        if (email == null) return ApiResponse.error("VALIDATION_ERROR", "email là bắt buộc, phải đúng định dạng và tối đa 100 ký tự");
        if (phone == null) return ApiResponse.error("VALIDATION_ERROR", "phone là bắt buộc: số di động Việt Nam gồm 10 chữ số, đầu 03/05/07/08/09 hoặc dạng +84 tương ứng");
        if (!isValidNewPassword(request.getPassword())) return ApiResponse.error("VALIDATION_ERROR",
                "Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số, tối đa 72 byte UTF-8");
        if (userRepository.existsByEmailIgnoreCase(email)) {
            return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
        }
        if (userRepository.existsByPhoneIn(phoneAliases(phone))) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }
        Role customerRole = roleRepository.findByName("Customer").orElseGet(() -> roleRepository.save(Role.builder().name("Customer").description("Default Customer role").build()));
        User user = User.builder().fullName(name.getData()).email(email).phone(phone).passwordHash(passwordEncoder.encode(request.getPassword())).role(customerRole).status(UserStatus.Unverified).build();
        User savedUser = userRepository.save(user);
        otpService.generateAndSaveOtp(email, OtpPurpose.Register, savedUser.getId(), null);
        return ApiResponse.success(UserResponse.fromEntity(savedUser));
    }

    @Transactional
    public ApiResponse<AuthResponse> verifyOtp(VerifyOtpRequest request) {
        User user = userRepository.findByIdentifier(normalizeIdentifier(request.getPhoneEmail()))
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        String target = normalizeEmail(user.getEmail());
        boolean isValid = otpService.verifyOtp(target, request.getOtpCode(), OtpPurpose.Register, user.getId());
        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }
        if (user.getStatus() == UserStatus.Unverified) {
            user.setStatus(UserStatus.Active);
        }
        user.setEmailVerifiedAt(LocalDateTime.now());
        user.setLastLoginAt(LocalDateTime.now());
        user = userRepository.save(user);
        return ApiResponse.success(issueTokens(user, null));
    }

    @Transactional
    public ApiResponse<String> resendOtp(ResendOtpRequest request) {
        String phoneEmail = normalizeIdentifier(request.getPhoneEmail());
        User user = userRepository.findByIdentifier(phoneEmail).orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        otpService.generateAndSaveOtp(user.getEmail(), OtpPurpose.Register, user.getId(), null);
        return ApiResponse.success("Yêu cầu gửi lại OTP tới email đăng ký đã được tiếp nhận");
    }

    @Transactional
    public ApiResponse<AuthResponse> login(LoginRequest request) {
        User user = userRepository.findByIdentifier(normalizeIdentifier(request.getIdentifier())).orElse(null);
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
    public ApiResponse<Void> logoutAll(String userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
        return ApiResponse.success(null);
    }

    @Transactional
    public ApiResponse<String> forgotPassword(ForgotPasswordRequest request) {
        String email = normalizeRecoveryEmail(request == null ? null : request.getPhoneEmail());
        if (email == null) {
            return ApiResponse.error("VALIDATION_ERROR", "Nhập email hợp lệ đã đăng ký để nhận OTP; chưa hỗ trợ khôi phục bằng SMS");
        }
        User user = userRepository.findByEmailForUpdate(email).orElse(null);
        if (user != null && user.getStatus() == UserStatus.Active) {
            otpService.requestPasswordResetOtp(email, user.getId());
        }
        // Account existence and account-specific throttling have the same public response.
        return ApiResponse.success("Nếu email thuộc tài khoản đang hoạt động, yêu cầu gửi OTP đã được tiếp nhận. "
                + "Vui lòng kiểm tra hộp thư và Spam; chờ ít nhất 60 giây trước khi yêu cầu mã mới.");
    }

    // The fifth failed attempt and its lock must commit even though the API returns 429.
    @Transactional(noRollbackFor = OtpLockedException.class)
    public ApiResponse<Void> resetPassword(ResetPasswordRequest request) {
        String email = normalizeRecoveryEmail(request == null ? null : request.getPhoneEmail());
        if (email == null || request.getOtpCode() == null || !request.getOtpCode().trim().matches("\\d{6}")) {
            return ApiResponse.error("VALIDATION_ERROR", "Email hợp lệ và mã OTP gồm 6 chữ số là bắt buộc");
        }
        String newPassword = request.getNewPassword();
        if (!isValidNewPassword(newPassword)) {
            return ApiResponse.error("VALIDATION_ERROR", "Mật khẩu mới cần ít nhất 8 ký tự, gồm chữ và số, tối đa 72 byte UTF-8");
        }
        User user = userRepository.findByEmailForUpdate(email).orElse(null);
        if (user == null || user.getStatus() != UserStatus.Active) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }
        boolean isValid = otpService.verifyOtp(email, request.getOtpCode(), OtpPurpose.Reset_Password, user.getId());
        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        refreshTokenRepository.revokeAllByUserId(user.getId());
        otpService.invalidatePasswordResetOtps(user.getId());
        return ApiResponse.success(null);
    }

    private String normalizeRecoveryEmail(String value) {
        if (value == null) {
            return null;
        }
        String email = value.trim().toLowerCase(Locale.ROOT);
        return email.length() <= 100 && email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") ? email : null;
    }

    private String normalizeIdentifier(String value) {
        String email = normalizeEmail(value);
        if (email != null) return email;
        String phone = normalizePhone(value);
        return phone != null ? phone : value;
    }

    @Transactional
    public ApiResponse<String> changePassword(String userId, ChangePasswordRequest request) {
        if (request == null || request.getCurrentPassword() == null || request.getCurrentPassword().isBlank()) {
            return ApiResponse.error("VALIDATION_ERROR", "Mật khẩu hiện tại là bắt buộc");
        }
        String newPassword = request.getNewPassword();
        if (!isValidNewPassword(newPassword)) {
            return ApiResponse.error("VALIDATION_ERROR", "Mật khẩu mới cần ít nhất 8 ký tự, gồm chữ và số, tối đa 72 byte UTF-8");
        }
        // Serialize password checks and updates so two requests cannot both use the old password.
        User user = userRepository.findByIdForUpdate(userId).orElse(null);
        if (user == null) {
            return ApiResponse.error("UNAUTHORIZED", "Tài khoản không tồn tại");
        }
        if (user.getStatus() != UserStatus.Active) {
            return ApiResponse.error("ACCOUNT_DISABLED", "Tài khoản chưa xác thực, đã bị khóa hoặc đã bị vô hiệu hóa");
        }
        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()) {
            return ApiResponse.error("CURRENT_PASSWORD_NOT_SET", "Tài khoản chưa có mật khẩu. Hãy dùng chức năng quên mật khẩu để thiết lập mật khẩu");
        }
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            return ApiResponse.error("CURRENT_PASSWORD_INVALID", "Mật khẩu hiện tại không đúng");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            return ApiResponse.error("VALIDATION_ERROR", "Mật khẩu mới phải khác mật khẩu hiện tại");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        refreshTokenRepository.revokeAllByUserId(user.getId());
        otpService.invalidatePasswordResetOtps(user.getId());
        return ApiResponse.success("Đổi mật khẩu thành công");
    }

    private boolean isValidNewPassword(String password) {
        return password != null && password.length() >= 8
                && password.getBytes(StandardCharsets.UTF_8).length <= 72
                && password.codePoints().anyMatch(Character::isLetter)
                && password.codePoints().anyMatch(Character::isDigit);
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

