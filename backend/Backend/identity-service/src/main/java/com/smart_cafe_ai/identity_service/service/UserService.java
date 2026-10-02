package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.*;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final OtpService otpService;
    private final CloudinaryService cloudinaryService;

    @Transactional(readOnly = true)
    public ApiResponse<UserResponse> getProfile(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        return ApiResponse.success(UserResponse.fromEntity(user));
    }

    @Transactional
    public ApiResponse<UserResponse> updateProfile(String userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName());
        }
        if (request.getAvatar() != null) {
            user.setAvatar(request.getAvatar());
        }

        User updatedUser = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(updatedUser));
    }

    @Transactional
    public ApiResponse<UserResponse> updateContact(String userId, UpdateContactRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        String target = request.getEmail() != null && !request.getEmail().isBlank() ? request.getEmail() : request.getPhone();
        boolean isValid = otpService.verifyOtp(target, request.getOtpCode(), OtpPurpose.Register) ||
                          otpService.verifyOtp(target, request.getOtpCode(), OtpPurpose.Reset_Password);

        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }

        if (request.getEmail() != null && !request.getEmail().isBlank()) {
            if (userRepository.existsByEmail(request.getEmail())) {
                return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
            }
            user.setEmail(request.getEmail());
        }

        if (request.getPhone() != null && !request.getPhone().isBlank()) {
            if (userRepository.existsByPhone(request.getPhone())) {
                return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
            }
            user.setPhone(request.getPhone());
        }

        User updatedUser = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(updatedUser));
    }

    @Transactional
    public ApiResponse<String> uploadAvatar(String userId, MultipartFile file) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        String avatarUrl = cloudinaryService.uploadImage(file, "smart-cafe/avatars");
        user.setAvatar(avatarUrl);
        userRepository.save(user);

        return ApiResponse.success(avatarUrl);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(String id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found with id: " + id));
        return UserResponse.fromEntity(user);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getBatchUsers(List<String> ids) {
        return userRepository.findAllById(ids).stream()
                .map(UserResponse::fromEntity)
                .toList();
    }
}
