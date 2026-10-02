package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.*;
import com.smart_cafe_ai.identity_service.security.UserPrincipal;
import com.smart_cafe_ai.identity_service.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/auth", "/api/v1/auth", "/api/auth"})
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

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
    public ResponseEntity<ApiResponse<String>> googleLogin() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                .body(ApiResponse.error("NOT_IMPLEMENTED", "Tính năng Đăng nhập bằng Google sẽ được hoàn thiện ở bước tiếp theo"));
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

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<String>> forgotPassword(@RequestBody ForgotPasswordRequest request) {
        ApiResponse<String> response = authService.forgotPassword(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@RequestBody ResetPasswordRequest request) {
        ApiResponse<Void> response = authService.resetPassword(request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PutMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody ChangePasswordRequest request
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        ApiResponse<Void> response = authService.changePassword(principal.getId(), request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }
}
