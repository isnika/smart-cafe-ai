package com.smart_cafe_ai.identity_service.controller;

import com.smart_cafe_ai.identity_service.dto.*;
import com.smart_cafe_ai.identity_service.security.UserPrincipal;
import com.smart_cafe_ai.identity_service.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping({"/users", "/api/v1/users"})
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getProfile(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        ApiResponse<UserResponse> response = userService.getProfile(principal.getId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> updateProfile(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody UpdateProfileRequest request
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        ApiResponse<UserResponse> response = userService.updateProfile(principal.getId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/me/contact")
    public ResponseEntity<ApiResponse<UserResponse>> updateContact(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody UpdateContactRequest request
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        ApiResponse<UserResponse> response = userService.updateContact(principal.getId(), request);
        return ResponseEntity.status(response.isSuccess() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PostMapping("/me/avatar")
    public ResponseEntity<ApiResponse<String>> uploadAvatar(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("UNAUTHORIZED", "Bạn chưa đăng nhập"));
        }
        if (file == null || file.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("VALIDATION_ERROR", "Vui lòng chọn file ảnh tải lên trong Body form-data với Key tên là 'file' (chọn kiểu File)"));
        }
        ApiResponse<String> response = userService.uploadAvatar(principal.getId(), file);
        return ResponseEntity.ok(response);
    }
}
