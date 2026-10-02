package com.smart_cafe_ai.identity_service.service;

import com.smart_cafe_ai.identity_service.dto.AddressRequest;
import com.smart_cafe_ai.identity_service.dto.AddressResponse;
import com.smart_cafe_ai.identity_service.dto.ApiResponse;
import com.smart_cafe_ai.identity_service.model.Address;
import com.smart_cafe_ai.identity_service.model.User;
import com.smart_cafe_ai.identity_service.repository.AddressRepository;
import com.smart_cafe_ai.identity_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AddressService {

    private final AddressRepository addressRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public ApiResponse<List<AddressResponse>> getUserAddresses(String userId) {
        List<Address> addresses = addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId);
        List<AddressResponse> responses = addresses.stream().map(AddressResponse::fromEntity).toList();
        return ApiResponse.success(responses);
    }

    @Transactional
    public ApiResponse<AddressResponse> addAddress(String userId, AddressRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Tài khoản không tồn tại"));

        List<Address> existingAddresses = addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId);
        boolean isFirstAddress = existingAddresses.isEmpty();

        if (Boolean.TRUE.equals(request.getIsDefault()) || isFirstAddress) {
            existingAddresses.forEach(addr -> {
                if (Boolean.TRUE.equals(addr.getIsDefault())) {
                    addr.setIsDefault(false);
                    addressRepository.save(addr);
                }
            });
        }

        Address address = Address.builder()
                .user(user)
                .receiverName(request.getReceiverName())
                .phone(request.getPhone())
                .province(request.getProvince())
                .district(request.getDistrict())
                .ward(request.getWard())
                .addressLine(request.getAddressLine())
                .isDefault(request.getIsDefault() || isFirstAddress)
                .build();

        Address savedAddress = addressRepository.save(address);
        return ApiResponse.success(AddressResponse.fromEntity(savedAddress));
    }

    @Transactional(readOnly = true)
    public ApiResponse<AddressResponse> getAddressById(String userId, Long addressId) {
        Address address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy địa chỉ"));
        return ApiResponse.success(AddressResponse.fromEntity(address));
    }

    @Transactional
    public ApiResponse<AddressResponse> updateAddress(String userId, Long addressId, AddressRequest request) {
        Address address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy địa chỉ"));

        if (Boolean.TRUE.equals(request.getIsDefault()) && !Boolean.TRUE.equals(address.getIsDefault())) {
            List<Address> existingAddresses = addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId);
            existingAddresses.forEach(addr -> {
                if (Boolean.TRUE.equals(addr.getIsDefault())) {
                    addr.setIsDefault(false);
                    addressRepository.save(addr);
                }
            });
        }

        address.setReceiverName(request.getReceiverName());
        address.setPhone(request.getPhone());
        address.setProvince(request.getProvince());
        address.setDistrict(request.getDistrict());
        address.setWard(request.getWard());
        address.setAddressLine(request.getAddressLine());
        if (request.getIsDefault() != null) {
            address.setIsDefault(request.getIsDefault());
        }

        Address updatedAddress = addressRepository.save(address);
        return ApiResponse.success(AddressResponse.fromEntity(updatedAddress));
    }

    @Transactional
    public ApiResponse<AddressResponse> setDefaultAddress(String userId, Long addressId) {
        Address targetAddress = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy địa chỉ"));

        List<Address> existingAddresses = addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId);
        existingAddresses.forEach(addr -> {
            boolean shouldBeDefault = addr.getId().equals(addressId);
            if (shouldBeDefault != Boolean.TRUE.equals(addr.getIsDefault())) {
                addr.setIsDefault(shouldBeDefault);
                addressRepository.save(addr);
            }
        });

        targetAddress.setIsDefault(true);
        return ApiResponse.success(AddressResponse.fromEntity(targetAddress));
    }

    @Transactional
    public ApiResponse<Void> deleteAddress(String userId, Long addressId) {
        Address address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy địa chỉ"));

        boolean wasDefault = Boolean.TRUE.equals(address.getIsDefault());
        addressRepository.delete(address);

        if (wasDefault) {
            List<Address> remaining = addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId);
            if (!remaining.isEmpty()) {
                Address newDefault = remaining.get(0);
                newDefault.setIsDefault(true);
                addressRepository.save(newDefault);
            }
        }

        return ApiResponse.success(null);
    }
}
