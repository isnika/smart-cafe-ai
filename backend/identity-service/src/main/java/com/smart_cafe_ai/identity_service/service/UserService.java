package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.dto.user.UpdateContactRequest;
import com.smart_cafe_ai.identity_service.dto.user.UpdateProfileRequest;
import com.smart_cafe_ai.identity_service.dto.user.UserResponse;
import com.smart_cafe_ai.identity_service.model.OtpPurpose;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.exception.OtpLockedException;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import static com.smart_cafe_ai.identity_service.validation.ProfileValidation.*;

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
        ApiResponse<String> validation = validateFullName(request == null ? null : request.getFullName());
        if (!validation.isSuccess()) {
            return ApiResponse.error(validation.getError().getCode(), validation.getError().getMessage());
        }
        String avatar = normalizeAvatarUrl(request.getAvatar());
        if (request.getAvatar() != null && avatar == null) {
            return ApiResponse.error("VALIDATION_ERROR", "avatar phải là URL HTTPS hợp lệ, tối đa 255 ký tự");
        }

        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        user.setFullName(validation.getData());
        String oldAvatar = user.getAvatar();
        if (request.getAvatar() != null) {
            user.setAvatar(avatar);
        }

        User updatedUser = userRepository.saveAndFlush(user);
        if (request.getAvatar() != null && !java.util.Objects.equals(oldAvatar, avatar)) {
            cloudinaryService.enqueueDeletionOnCommit(cloudinaryService.ownedPublicId(oldAvatar, "smart-cafe/avatars/" + userId));
        }
        return ApiResponse.success(UserResponse.fromEntity(updatedUser));
    }

    @Transactional
    public ApiResponse<String> requestContactOtp(String userId, UpdateContactRequest request) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));
        ApiResponse<ContactChange> validation = validateContactChange(user, request);
        if (!validation.isSuccess()) return ApiResponse.error(validation.getError().getCode(), validation.getError().getMessage());
        ContactChange change = validation.getData();
        String deliveryEmail = change.email() ? change.target() : normalizeEmail(user.getEmail());
        if (!change.email() && (deliveryEmail == null || user.getEmailVerifiedAt() == null)) {
            return ApiResponse.error("EMAIL_NOT_VERIFIED", "Cần xác thực email hiện tại trước khi yêu cầu OTP đổi số điện thoại");
        }
        otpService.requestContactChangeOtp(change.target(), change.purpose(), userId, deliveryEmail);
        return ApiResponse.success(change.email() ? "Yêu cầu gửi OTP tới email mới đã được tiếp nhận"
                : "Yêu cầu gửi OTP đổi số điện thoại tới email hiện tại đã được tiếp nhận");
    }

    @Transactional(noRollbackFor = OtpLockedException.class)
    public ApiResponse<UserResponse> updateContact(String userId, UpdateContactRequest request) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        ApiResponse<ContactChange> validation = validateContactChange(user, request);
        if (!validation.isSuccess()) {
            return ApiResponse.error(validation.getError().getCode(), validation.getError().getMessage());
        }

        ContactChange change = validation.getData();
        if (request.getOtpCode() == null || !request.getOtpCode().strip().matches("[0-9]{6}")) {
            return ApiResponse.error("VALIDATION_ERROR", "otp_code là bắt buộc và phải gồm đúng 6 chữ số");
        }
        if (!change.email() && (normalizeEmail(user.getEmail()) == null || user.getEmailVerifiedAt() == null)) {
            return ApiResponse.error("EMAIL_NOT_VERIFIED", "Cần xác thực email hiện tại trước khi đổi số điện thoại");
        }
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
            // Email OTP authorizes the change; it does not prove ownership of the phone number.
            user.setPhoneVerifiedAt(null);
        }

        User updatedUser = userRepository.saveAndFlush(user);
        otpService.invalidateContactChangeOtps(userId);
        return ApiResponse.success(UserResponse.fromEntity(updatedUser));
    }

    private ApiResponse<ContactChange> validateContactChange(User user, UpdateContactRequest request) {
        if (request == null) return ApiResponse.error("VALIDATION_ERROR", "Cần cung cấp email mới hoặc số điện thoại mới");
        boolean hasEmail = request.getEmail() != null || request.getNewEmail() != null;
        boolean hasPhone = request.getPhone() != null || request.getNewPhone() != null;
        if (hasEmail == hasPhone) {
            return ApiResponse.error(
                    "VALIDATION_ERROR", "Chỉ được thay đổi email hoặc số điện thoại mỗi lần");
        }

        if (hasEmail) {
            boolean paired = request.getNewEmail() != null;
            String current = normalizeEmail(request.getEmail());
            String target = normalizeEmail(paired ? request.getNewEmail() : request.getEmail());
            if (target == null) return ApiResponse.error("VALIDATION_ERROR", "Email mới phải đúng định dạng và tối đa 100 ký tự");
            if (paired && (current == null || !current.equals(normalizeEmail(user.getEmail())))) {
                return ApiResponse.error("CONTACT_MISMATCH", "Email hiện tại không khớp tài khoản");
            }
            if (target.equalsIgnoreCase(user.getEmail())) {
                return ApiResponse.error("VALIDATION_ERROR", "Email mới phải khác email hiện tại");
            }
            if (userRepository.existsByEmailIgnoreCaseAndIdNot(target, user.getId())) {
                return ApiResponse.error("CONFLICT", "Email đã được sử dụng");
            }
            return ApiResponse.success(new ContactChange(true, target, OtpPurpose.Change_Email));
        }

        boolean paired = request.getNewPhone() != null;
        String current = normalizePhone(request.getPhone());
        String target = normalizePhone(paired ? request.getNewPhone() : request.getPhone());
        if (target == null) return ApiResponse.error("VALIDATION_ERROR",
                "Số điện thoại mới phải gồm 10 chữ số, đầu 03/05/07/08/09 hoặc dạng +84 tương ứng");
        if (paired && (current == null || !current.equals(normalizePhone(user.getPhone())))) {
            return ApiResponse.error("CONTACT_MISMATCH", "Số điện thoại hiện tại không khớp tài khoản");
        }
        if (target.equals(normalizePhone(user.getPhone()))) {
            return ApiResponse.error("VALIDATION_ERROR", "Số điện thoại mới phải khác số hiện tại");
        }
        if (userRepository.existsByPhoneInAndIdNot(phoneAliases(target), user.getId())) {
            return ApiResponse.error("CONFLICT", "Số điện thoại đã được sử dụng");
        }
        return ApiResponse.success(new ContactChange(false, target, OtpPurpose.Change_Phone));
    }

    private record ContactChange(boolean email, String target, OtpPurpose purpose) {
    }

    @Transactional
    public ApiResponse<Map<String, String>> uploadAvatar(String userId, MultipartFile file) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        String folder = "smart-cafe/avatars/" + userId;
        String oldPublicId = cloudinaryService.ownedPublicId(user.getAvatar(), folder);
        CloudinaryService.UploadedImage image = cloudinaryService.uploadImage(file, folder);
        boolean synchronizedTransaction = TransactionSynchronizationManager.isSynchronizationActive();
        if (synchronizedTransaction) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) cloudinaryService.enqueueDeletion(image.publicId());
                }
            });
        }
        try {
            user.setAvatar(image.url());
            userRepository.saveAndFlush(user);
            if (synchronizedTransaction) cloudinaryService.enqueueDeletionOnCommit(oldPublicId);
        } catch (RuntimeException ex) {
            if (!synchronizedTransaction) cloudinaryService.enqueueDeletion(image.publicId());
            throw ex;
        }
        if (!synchronizedTransaction) cloudinaryService.enqueueDeletion(oldPublicId);

        return ApiResponse.success(Map.of("avatar", image.url()));
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

