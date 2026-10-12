package com.smart_cafe_ai.identity_service.repository;

import com.smart_cafe_ai.identity_service.model.Address;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AddressRepository extends JpaRepository<Address, Long> {
    List<Address> findByUserIdOrderByIsDefaultDescCreatedAtDesc(String userId);
    Optional<Address> findByIdAndUserId(Long id, String userId);
    Optional<Address> findByUserIdAndIsDefaultTrue(String userId);
}
