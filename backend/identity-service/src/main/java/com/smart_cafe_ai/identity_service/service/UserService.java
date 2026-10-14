package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.user.UpdateContactRequest;
import com.smart_cafe_ai.identity_service.dto.user.UpdateProfileRequest;
import com.smart_cafe_ai.identity_service.dto.user.UserResponse;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final OtpService otpService;
    private final CloudinaryService cloudinaryService;

    public UserService(
            UserRepository userRepository,
            OtpService otpService,
            CloudinaryService cloudinaryService
    ) {
        this.userRepository = userRepository;
        this.otpService = otpService;
        this.cloudinaryService = cloudinaryService;
    }

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
    public ApiResponse<String> requestContactOtp(String userId, UpdateContactRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        boolean hasEmail = hasText(request.getEmail()) || hasText(request.getNewEmail());
        boolean hasPhone = hasText(request.getPhone()) || hasText(request.getNewPhone());
        if (hasEmail == hasPhone) {
            return ApiResponse.error(
                    "VALIDATION_ERROR", "Chỉ cung cấp email mới hoặc số điện thoại mới");
        }

        String current = hasEmail ? request.getEmail() : request.getPhone();
        String newValue = hasEmail ? request.getNewEmail() : request.getNewPhone();
        if (hasText(current) && hasText(newValue)) {
            String accountValue = hasEmail ? user.getEmail() : user.getPhone();
            boolean matches = accountValue != null && (hasEmail
                    ? current.trim().equalsIgnoreCase(accountValue)
                    : current.trim().equals(accountValue));
            if (!matches) {
                return ApiResponse.error(
                        "CONTACT_MISMATCH",
                        hasEmail ? "Email hiện tại không khớp tài khoản"
                                : "Số điện thoại hiện tại không khớp tài khoản");
            }
        }

        String target = hasText(newValue) ? newValue.trim() : current.trim();
        if (hasEmail && userRepository.existsByEmail(target)
                && !target.equalsIgnoreCase(user.getEmail())) {
            return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
        }
        if (hasPhone && userRepository.existsByPhone(target)
                && !target.equals(user.getPhone())) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }

        OtpPurpose purpose = hasEmail ? OtpPurpose.Change_Email : OtpPurpose.Change_Phone;
        otpService.generateAndSaveOtp(target, purpose, user.getId(), null);
        return ApiResponse.success(
                "OTP đã được tạo cho " + target + "; hiện kiểm tra mã trong log của identity-service");
    }

    @Transactional
    public ApiResponse<UserResponse> updateContact(String userId, UpdateContactRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        ApiResponse<ContactChange> validation = validateContactChange(user, request);
        if (!validation.isSuccess()) {
            return ApiResponse.error(validation.getError().getCode(), validation.getError().getMessage());
        }

        ContactChange change = validation.getData();
        boolean isValid = otpService.verifyOtp(
                change.target(), request.getOtpCode(), change.purpose(), user.getId());

        if (!isValid) {
            return ApiResponse.error("OTP_INVALID", "Mã OTP không hợp lệ hoặc đã hết hạn");
        }

        if (change.email()) {
            user.setEmail(change.target());
            user.setEmailVerifiedAt(LocalDateTime.now());
        } else {
            user.setPhone(change.target());
            user.setPhoneVerifiedAt(LocalDateTime.now());
        }

        User updatedUser = userRepository.save(user);
        return ApiResponse.success(UserResponse.fromEntity(updatedUser));
    }

    private ApiResponse<ContactChange> validateContactChange(User user, UpdateContactRequest request) {
        boolean hasEmail = hasText(request.getEmail()) || hasText(request.getNewEmail());
        boolean hasPhone = hasText(request.getPhone()) || hasText(request.getNewPhone());
        if (hasEmail == hasPhone) {
            return ApiResponse.error(
                    "VALIDATION_ERROR", "Chỉ được thay đổi email hoặc số điện thoại mỗi lần");
        }

        if (hasEmail) {
            if (!hasText(request.getEmail()) || !hasText(request.getNewEmail())) {
                return ApiResponse.error(
                        "VALIDATION_ERROR", "Cần cung cấp email hiện tại và email mới");
            }
            String current = request.getEmail().trim();
            String target = request.getNewEmail().trim();
            if (user.getEmail() == null || !current.equalsIgnoreCase(user.getEmail())) {
                return ApiResponse.error("CONTACT_MISMATCH", "Email hiện tại không khớp tài khoản");
            }
            if (target.equalsIgnoreCase(user.getEmail())) {
                return ApiResponse.error("VALIDATION_ERROR", "Email mới phải khác email hiện tại");
            }
            if (userRepository.existsByEmail(target)) {
                return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
            }
            return ApiResponse.success(new ContactChange(true, target, OtpPurpose.Change_Email));
        }

        if (!hasText(request.getPhone()) || !hasText(request.getNewPhone())) {
            return ApiResponse.error(
                    "VALIDATION_ERROR", "Cần cung cấp số điện thoại hiện tại và số điện thoại mới");
        }
        String current = request.getPhone().trim();
        String target = request.getNewPhone().trim();
        if (user.getPhone() == null || !current.equals(user.getPhone())) {
            return ApiResponse.error("CONTACT_MISMATCH", "Số điện thoại hiện tại không khớp tài khoản");
        }
        if (target.equals(user.getPhone())) {
            return ApiResponse.error("VALIDATION_ERROR", "Số điện thoại mới phải khác số hiện tại");
        }
        if (userRepository.existsByPhone(target)) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }
        return ApiResponse.success(new ContactChange(false, target, OtpPurpose.Change_Phone));
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record ContactChange(boolean email, String target, OtpPurpose purpose) {
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

