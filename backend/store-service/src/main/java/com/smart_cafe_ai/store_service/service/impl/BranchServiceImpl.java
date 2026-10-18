package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.branch.BranchRequest;
import com.smart_cafe_ai.store_service.dto.branch.BranchResponse;
import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.enums.BranchStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.BranchRepository;
import com.smart_cafe_ai.store_service.service.BranchService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Time;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BranchServiceImpl implements BranchService {

    private final BranchRepository branchRepository;

    @Override
    @Transactional(readOnly = true)
    public List<BranchResponse> getAllBranches(BranchStatus status, String query) {
        List<Branch> branches;
        if (status != null) {
            branches = branchRepository.findAllByStatus(status);
        } else {
            branches = branchRepository.findAll();
        }

        if (query != null && !query.isBlank()) {
            String q = query.toLowerCase();
            branches = branches.stream()
                    .filter(b -> b.getName().toLowerCase().contains(q) || b.getCode().toLowerCase().contains(q))
                    .collect(Collectors.toList());
        }

        return branches.stream()
                .map(BranchResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public BranchResponse getBranchById(Integer id) {
        Branch branch = branchRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", id));
        return BranchResponse.fromEntity(branch);
    }

    @Override
    @Transactional
    public BranchResponse createBranch(BranchRequest request) {
        if (branchRepository.existsByCode(request.getCode())) {
            throw new BusinessException("BRANCH_CODE_EXISTS", "Mã chi nhánh '" + request.getCode() + "' đã tồn tại");
        }

        Branch branch = Branch.builder()
                .code(request.getCode())
                .name(request.getName())
                .address(request.getAddress())
                .phone(request.getPhone())
                .timezone(request.getTimezone() != null ? request.getTimezone() : "Asia/Ho_Chi_Minh")
                .openingTime(parseTime(request.getOpeningTime()))
                .closingTime(parseTime(request.getClosingTime()))
                .acceptsOnlineOrders(request.getAcceptsOnlineOrders() != null ? request.getAcceptsOnlineOrders() : true)
                .deliveryRadiusKm(request.getDeliveryRadiusKm())
                .deliveryFee(request.getDeliveryFee() != null ? request.getDeliveryFee() : BigDecimal.ZERO)
                .status(BranchStatus.Active)
                .build();

        Branch saved = branchRepository.save(branch);
        return BranchResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public BranchResponse updateBranch(Integer id, BranchRequest request) {
        Branch branch = branchRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", id));

        if (!branch.getCode().equalsIgnoreCase(request.getCode()) && branchRepository.existsByCode(request.getCode())) {
            throw new BusinessException("BRANCH_CODE_EXISTS", "Mã chi nhánh '" + request.getCode() + "' đã tồn tại");
        }

        branch.setCode(request.getCode());
        branch.setName(request.getName());
        branch.setAddress(request.getAddress());
        branch.setPhone(request.getPhone());
        if (request.getTimezone() != null) {
            branch.setTimezone(request.getTimezone());
        }
        if (request.getOpeningTime() != null) {
            branch.setOpeningTime(parseTime(request.getOpeningTime()));
        }
        if (request.getClosingTime() != null) {
            branch.setClosingTime(parseTime(request.getClosingTime()));
        }
        if (request.getAcceptsOnlineOrders() != null) {
            branch.setAcceptsOnlineOrders(request.getAcceptsOnlineOrders());
        }
        if (request.getDeliveryRadiusKm() != null) {
            branch.setDeliveryRadiusKm(request.getDeliveryRadiusKm());
        }
        if (request.getDeliveryFee() != null) {
            branch.setDeliveryFee(request.getDeliveryFee());
        }

        Branch saved = branchRepository.save(branch);
        return BranchResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public BranchResponse updateBranchStatus(Integer id, BranchStatus status) {
        Branch branch = branchRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", id));

        branch.setStatus(status);
        Branch saved = branchRepository.save(branch);
        return BranchResponse.fromEntity(saved);
    }

    private Time parseTime(String timeStr) {
        if (timeStr == null || timeStr.isBlank()) {
            return null;
        }
        try {
            if (timeStr.length() == 5) {
                timeStr = timeStr + ":00";
            }
            return Time.valueOf(timeStr);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
