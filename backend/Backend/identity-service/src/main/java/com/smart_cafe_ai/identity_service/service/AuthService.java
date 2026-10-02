package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.*;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.Role;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.model.UserStatus;
import com.smart_cafe_ai.identity_service.repository.RoleRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import com.smart_cafe_ai.identity_service.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final OtpService otpService;

    @Transactional
    public ApiResponse<UserResponse> register(RegisterRequest request) {
        if (request.getFullName() == null || request.getFullName().isBlank()) {
            return ApiResponse.error("VALIDATION_ERROR", "Họ và tên (fullName/full_name) là bắt buộc");
        }

        if ((request.getEmail() == null || request.getEmail().isBlank()) &&
            (request.getPhone() == null || request.getPhone().isBlank())) {
            return ApiResponse.error("VALIDATION_ERROR", "Email hoặc Số điện thoại là bắt buộc");
        }

        if (request.getEmail() != null && !request.getEmail().isBlank() && userRepository.existsByEmail(request.getEmail())) {
            return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
        }

        if (request.getPhone() != null && !request.getPhone().isBlank() && userRepository.existsByPhone(request.getPhone())) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }

        Role customerRole = roleRepository.findByName("Customer")
                .orElseGet(() -> roleRepository.save(Role.builder().name("Customer").description("Default Customer role").build()));

        User user = User.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .phone(request.getPhone())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(customerRole)
                .status(UserStatus.Unverified)
                .build();

        User savedUser = userRepository.save(user);

        String target = request.getPhone() != null && !request.getPhone().isBlank() ? request.getPhone() : request.getEmail();
        otpService.generateAndSaveOtp(target, OtpPurpose.Register);

        return ApiResponse.success(UserResponse.fromEntity(savedUser));
    }

    @Transactional
    public ApiResponse<AuthResponse> verifyOtp(VerifyOtpRequest request) {
        boolean isValid = otpService.verifyOtp(request.getPhoneEmail(), request.getOtpCode(), OtpPurpose.Register) ||
                          otpService.verifyOtp(request.getPhoneEmail(), request.getOtpCode(), OtpPurpose.Reset_Password);

        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }

        User user = userRepository.findByIdentifier(request.getPhoneEmail())
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        if (user.getStatus() == UserStatus.Unverified) {
            user.setStatus(UserStatus.Active);
            user = userRepository.save(user);
        }

        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String accessToken = jwtService.generateAccessToken(user.getId(), roleName, user.getBranchId());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        AuthResponse authResponse = AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(jwtService.getAccessTokenExpirationMs() / 1000)
                .user(UserResponse.fromEntity(user))
                .build();

        return ApiResponse.success(authResponse);
    }

    @Transactional
    public ApiResponse<String> resendOtp(ResendOtpRequest request) {
        String phoneEmail = request.getPhoneEmail();
        userRepository.findByIdentifier(phoneEmail)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        String code = otpService.generateAndSaveOtp(phoneEmail, OtpPurpose.Register);
        return ApiResponse.success("Đã gửi lại mã OTP thành công");
    }

    @Transactional(readOnly = true)
    public ApiResponse<AuthResponse> login(LoginRequest request) {
        User user = userRepository.findByIdentifier(request.getIdentifier())
                .orElse(null);

        if (user == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            return ApiResponse.error("UNAUTHORIZED", "Tên đăng nhập hoặc mật khẩu không chính xác");
        }

        if (user.getStatus() == UserStatus.Unverified) {
            return ApiResponse.error("ACCOUNT_UNVERIFIED", "Tài khoản chưa được xác thực OTP");
        }

        if (user.getStatus() == UserStatus.Banned) {
            return ApiResponse.error("ACCOUNT_BANNED", "Tài khoản của bạn đã bị khóa");
        }

        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String accessToken = jwtService.generateAccessToken(user.getId(), roleName, user.getBranchId());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        AuthResponse response = AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(jwtService.getAccessTokenExpirationMs() / 1000)
                .user(UserResponse.fromEntity(user))
                .build();

        return ApiResponse.success(response);
    }

    public ApiResponse<AuthResponse> refreshToken(RefreshTokenRequest request) {
        String refreshToken = request.getRefreshToken();
        if (refreshToken == null || !jwtService.isTokenValid(refreshToken)) {
            return ApiResponse.error("TOKEN_EXPIRED", "Refresh Token không hợp lệ hoặc đã hết hạn");
        }

        String userId = jwtService.extractUserId(refreshToken);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String roleName = user.getRole() != null ? user.getRole().getName() : "Customer";
        String newAccessToken = jwtService.generateAccessToken(user.getId(), roleName, user.getBranchId());
        String newRefreshToken = jwtService.generateRefreshToken(user.getId());

        AuthResponse response = AuthResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .expiresIn(jwtService.getAccessTokenExpirationMs() / 1000)
                .user(UserResponse.fromEntity(user))
                .build();

        return ApiResponse.success(response);
    }

    public ApiResponse<Void> logout(String refreshToken) {
        // Clear context / token blacklist stub
        return ApiResponse.success(null);
    }

    @Transactional
    public ApiResponse<String> forgotPassword(ForgotPasswordRequest request) {
        String phoneEmail = request.getPhoneEmail();
        userRepository.findByIdentifier(phoneEmail).ifPresent(user -> {
            otpService.generateAndSaveOtp(phoneEmail, OtpPurpose.Reset_Password);
        });
        // Always return success to prevent user enumeration
        return ApiResponse.success("Nếu tài khoản tồn tại, mã OTP đã được gửi đến " + phoneEmail);
    }

    @Transactional
    public ApiResponse<Void> resetPassword(ResetPasswordRequest request) {
        boolean isValid = otpService.verifyOtp(request.getPhoneEmail(), request.getOtpCode(), OtpPurpose.Reset_Password);
        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }

        User user = userRepository.findByIdentifier(request.getPhoneEmail())
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        return ApiResponse.success(null);
    }

    @Transactional
    public ApiResponse<Void> changePassword(String userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
            if (request.getCurrentPassword() == null || !passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
                return ApiResponse.error("VALIDATION_ERROR", "Mật khẩu hiện tại không đúng");
            }
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        return ApiResponse.success(null);
    }
}
