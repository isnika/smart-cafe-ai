package com.smart_cafe_ai.store_service.repository;

import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.enums.BranchStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BranchRepository extends JpaRepository<Branch, Integer> {

    List<Branch> findAllByStatus(BranchStatus status);

    boolean existsByCode(String code);

    Optional<Branch> findByCode(String code);
}
