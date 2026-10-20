package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.auth.AuthResponse;
import com.smart_cafe_ai.identity_service.dto.auth.ChangePasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ForgotPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.LoginRequest;
import com.smart_cafe_ai.identity_service.dto.auth.GoogleLoginRequest;
import com.smart_cafe_ai.identity_service.dto.auth.RefreshTokenRequest;
import com.smart_cafe_ai.identity_service.dto.auth.RegisterRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ResendOtpRequest;
import com.smart_cafe_ai.identity_service.dto.auth.ResetPasswordRequest;
import com.smart_cafe_ai.identity_service.dto.auth.VerifyOtpRequest;
import com.smart_cafe_ai.identity_service.dto.user.UserResponse;
import com.smart_cafe_ai.identity_service.security.UserPrincipal;
import com.smart_cafe_ai.identity_service.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/auth", "/api/v1/auth", "/api/auth"})
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<UserResponse>> register(@RequestBody RegisterRequest request) {
        ApiResponse<UserResponse> response = authService.register(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.CREATED : HttpStatus.BAD_REQUEST).body(response);
    }

    @PostMapping("/otp/verify")
    public ResponseEntity<ApiResponse<AuthResponse>> verifyOtp(@RequestBody VerifyOtpRequest request) {
        ApiResponse<AuthResponse> response = authService.verifyOtp(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PostMapping("/otp/resend")
    public ResponseEntity<ApiResponse<String>> resendOtp(@RequestBody ResendOtpRequest request) {
        ApiResponse<String> response = authService.resendOtp(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@RequestBody LoginRequest request) {
        ApiResponse<AuthResponse> response = authService.login(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.UNAUTHORIZED).body(response);
    }

    @PostMapping("/google")
    public ResponseEntity<ApiResponse<AuthResponse>> googleLogin(@RequestBody(required = false) GoogleLoginRequest request) {
        return googleResponse(() -> authService.googleLogin(request));
    }

    @PostMapping("/google/link")
    public ResponseEntity<ApiResponse<AuthResponse>> linkGoogle(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody(required = false) GoogleLoginRequest request) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("UNAUTHORIZED", "Hãy đăng nhập trước khi liên kết Google"));
        }
        return googleResponse(() -> authService.linkGoogle(principal.getId(), request));
    }

    private ResponseEntity<ApiResponse<AuthResponse>> googleResponse(
            java.util.function.Supplier<ApiResponse<AuthResponse>> action) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.error("GOOGLE_ACCOUNT_CONFLICT",
                            "Thông tin tài khoản đã thay đổi hoặc trùng lặp, vui lòng thử đăng nhập lại"));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(@RequestBody RefreshTokenRequest request) {
        ApiResponse<AuthResponse> response = authService.refreshToken(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.UNAUTHORIZED).body(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@RequestBody(required = false) RefreshTokenRequest request) {
        String token = request != null ? request.getRefreshToken() : null;
        ApiResponse<Void> response = authService.logout(token);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout-all")
    public ResponseEntity<ApiResponse<Void>> logoutAll(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        return ResponseEntity.ok(authService.logoutAll(principal.getId()));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<String>> forgotPassword(@RequestBody(required = false) ForgotPasswordRequest request) {
        ApiResponse<String> response = authService.forgotPassword(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@RequestBody(required = false) ResetPasswordRequest request) {
        ApiResponse<Void> response = authService.resetPassword(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PutMapping("/change-password")
    public ResponseEntity<ApiResponse<String>> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody(required = false) ChangePasswordRequest request
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        ApiResponse<String> response = authService.changePassword(principal.getId(), request);
        HttpStatus status = response.isSuccess() ? HttpStatus.OK
                : "UNAUTHORIZED".equals(response.getError().getCode()) ? HttpStatus.UNAUTHORIZED
                : "ACCOUNT_DISABLED".equals(response.getError().getCode()) ? HttpStatus.FORBIDDEN
                : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(response);
    }
}

