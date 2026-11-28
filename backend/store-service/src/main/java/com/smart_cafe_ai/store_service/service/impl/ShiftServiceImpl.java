package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.shift.ShiftRequest;
import com.smart_cafe_ai.store_service.dto.shift.ShiftResponse;
import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.entity.Shift;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.BranchRepository;
import com.smart_cafe_ai.store_service.repository.ShiftRepository;
import com.smart_cafe_ai.store_service.service.ShiftService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Time;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ShiftServiceImpl implements ShiftService {

    private final ShiftRepository shiftRepository;
    private final BranchRepository branchRepository;
    private final com.smart_cafe_ai.store_service.repository.ScheduleRepository scheduleRepository;
    private final com.smart_cafe_ai.store_service.security.BranchScope branchScope;

    @Override
    @Transactional(readOnly = true)
    public List<ShiftResponse> getShifts(Integer branchId, Boolean isActive) {
        branchId = branchScope.restrict(branchId);
        List<Shift> shifts;
        if (branchId != null && isActive != null) {
            shifts = shiftRepository.findAllByBranchIdAndIsActive(branchId, isActive);
        } else if (branchId != null) {
            shifts = shiftRepository.findAllByBranchId(branchId);
        } else {
            shifts = shiftRepository.findAll();
        }

        return shifts.stream()
                .map(ShiftResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ShiftResponse getShiftById(Integer id) {
        Shift shift = shiftRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", id));
        branchScope.check(shift.getBranch().getId());
        return ShiftResponse.fromEntity(shift);
    }

    @Override
    @Transactional
    public ShiftResponse createShift(ShiftRequest request) {
        if (request.getBranchId() == null) {
            throw new BusinessException("BRANCH_ID_REQUIRED", "branch_id không được để trống");
        }
        branchScope.check(request.getBranchId());

        Branch branch = branchRepository.findById(request.getBranchId())
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", request.getBranchId()));

        if (request.getStartTime().equals(request.getEndTime())) {
            throw new BusinessException("INVALID_SHIFT_TIME", "Giờ bắt đầu và kết thúc không được trùng nhau");
        }

        if (shiftRepository.existsByBranchIdAndName(request.getBranchId(), request.getName())) {
            throw new BusinessException("SHIFT_NAME_EXISTS", "Tên ca '" + request.getName() + "' đã tồn tại ở chi nhánh này");
        }

        Shift shift = Shift.builder()
                .branch(branch)
                .name(request.getName())
                .startTime(Time.valueOf(request.getStartTime()))
                .endTime(Time.valueOf(request.getEndTime()))
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();

        Shift saved = shiftRepository.save(shift);
        return ShiftResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public ShiftResponse updateShift(Integer id, ShiftRequest request) {
        Shift shift = shiftRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", id));
        branchScope.check(shift.getBranch().getId());
        if (request.getBranchId() != null) branchScope.check(request.getBranchId());
        if ((!shift.getStartTime().toLocalTime().equals(request.getStartTime()) || !shift.getEndTime().toLocalTime().equals(request.getEndTime())) && scheduleRepository.existsByShiftId(id))
            throw new BusinessException("SHIFT_HAS_SCHEDULES", "Không thể đổi giờ khung ca đã có lịch; hãy tạo khung ca mới");

        if (request.getStartTime().equals(request.getEndTime())) {
            throw new BusinessException("INVALID_SHIFT_TIME", "Giờ bắt đầu và kết thúc không được trùng nhau");
        }

        if (!shift.getName().equalsIgnoreCase(request.getName()) &&
                shiftRepository.existsByBranchIdAndName(shift.getBranch().getId(), request.getName())) {
            throw new BusinessException("SHIFT_NAME_EXISTS", "Tên ca '" + request.getName() + "' đã tồn tại ở chi nhánh này");
        }

        shift.setName(request.getName());
        shift.setStartTime(Time.valueOf(request.getStartTime()));
        shift.setEndTime(Time.valueOf(request.getEndTime()));
        if (request.getIsActive() != null) {
            shift.setIsActive(request.getIsActive());
        }

        Shift saved = shiftRepository.save(shift);
        return ShiftResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public ShiftResponse updateShiftActive(Integer id, Boolean isActive) {
        Shift shift = shiftRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", id));
        branchScope.check(shift.getBranch().getId());

        shift.setIsActive(isActive != null ? isActive : true);
        Shift saved = shiftRepository.save(shift);
        return ShiftResponse.fromEntity(saved);
    }
}
