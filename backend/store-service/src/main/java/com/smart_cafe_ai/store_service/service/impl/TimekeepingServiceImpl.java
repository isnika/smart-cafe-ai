package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingAdjustmentRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingCheckInRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingCheckOutRequest;
import com.smart_cafe_ai.store_service.dto.timekeeping.TimekeepingResponse;
import com.smart_cafe_ai.store_service.entity.Schedule;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.entity.Timekeeping;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import com.smart_cafe_ai.store_service.enums.TimekeepingSource;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.ScheduleRepository;
import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import com.smart_cafe_ai.store_service.repository.TimekeepingRepository;
import com.smart_cafe_ai.store_service.service.TimekeepingService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TimekeepingServiceImpl implements TimekeepingService {

    private final TimekeepingRepository timekeepingRepository;
    private final ScheduleRepository scheduleRepository;
    private final StaffProfileRepository staffProfileRepository;

    @Override
    @Transactional
    public TimekeepingResponse checkIn(String userId, TimekeepingCheckInRequest request) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên cho tài khoản", userId));

        Schedule schedule = scheduleRepository.findById(request.getScheduleId())
                .orElseThrow(() -> new ResourceNotFoundException("Lịch làm việc", request.getScheduleId()));

        if (!schedule.getStaff().getId().equals(staff.getId())) {
            throw new BusinessException("FORBIDDEN_SCHEDULE", "Bạn không thể check-in vào ca làm việc của nhân viên khác");
        }

        Optional<Timekeeping> existingOpt = timekeepingRepository.findByScheduleId(schedule.getId());
        Timekeeping timekeeping;

        if (existingOpt.isPresent()) {
            timekeeping = existingOpt.get();
            if (timekeeping.getCheckIn() != null) {
                throw new BusinessException("ALREADY_CHECKED_IN", "Ca làm việc này đã được check-in vào lúc " + timekeeping.getCheckIn());
            }
            timekeeping.setCheckIn(LocalDateTime.now());
            timekeeping.setSource(request.getSource() != null ? request.getSource() : TimekeepingSource.Manual);
        } else {
            timekeeping = Timekeeping.builder()
                    .schedule(schedule)
                    .checkIn(LocalDateTime.now())
                    .source(request.getSource() != null ? request.getSource() : TimekeepingSource.Manual)
                    .isAdjusted(false)
                    .build();
        }

        Timekeeping saved = timekeepingRepository.save(timekeeping);
        return TimekeepingResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public TimekeepingResponse checkOut(String userId, TimekeepingCheckOutRequest request) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên cho tài khoản", userId));

        Schedule schedule = scheduleRepository.findById(request.getScheduleId())
                .orElseThrow(() -> new ResourceNotFoundException("Lịch làm việc", request.getScheduleId()));

        if (!schedule.getStaff().getId().equals(staff.getId())) {
            throw new BusinessException("FORBIDDEN_SCHEDULE", "Bạn không thể check-out khỏi ca làm việc của nhân viên khác");
        }

        Timekeeping timekeeping = timekeepingRepository.findByScheduleId(schedule.getId())
                .orElseThrow(() -> new BusinessException("NOT_CHECKED_IN", "Chưa có lượt check-in cho ca này, không thể check-out"));

        if (timekeeping.getCheckIn() == null) {
            throw new BusinessException("NOT_CHECKED_IN", "Chưa có lượt check-in cho ca này, không thể check-out");
        }

        if (timekeeping.getCheckOut() != null) {
            throw new BusinessException("ALREADY_CHECKED_OUT", "Ca làm việc này đã được check-out vào lúc " + timekeeping.getCheckOut());
        }

        timekeeping.setCheckOut(LocalDateTime.now());
        schedule.setStatus(ScheduleStatus.Completed);
        scheduleRepository.save(schedule);

        Timekeeping saved = timekeepingRepository.save(timekeeping);
        return TimekeepingResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TimekeepingResponse> getMyTimekeeping(String userId, LocalDate from, LocalDate to) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên cho tài khoản", userId));

        LocalDate startDate = from != null ? from : LocalDate.now().minusDays(30);
        LocalDate endDate = to != null ? to : LocalDate.now();

        List<Timekeeping> records = timekeepingRepository.findTimekeepingsFiltered(null, staff.getId(), startDate, endDate);
        return records.stream()
                .map(TimekeepingResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<TimekeepingResponse> getTimekeeping(Integer branchId, Long staffId, LocalDate from, LocalDate to) {
        LocalDate startDate = from != null ? from : LocalDate.now().minusDays(30);
        LocalDate endDate = to != null ? to : LocalDate.now();

        List<Timekeeping> records = timekeepingRepository.findTimekeepingsFiltered(branchId, staffId, startDate, endDate);
        return records.stream()
                .map(TimekeepingResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public TimekeepingResponse adjustTimekeeping(Long id, String managerUserId, TimekeepingAdjustmentRequest request) {
        Timekeeping timekeeping = timekeepingRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bản ghi chấm công", id));

        StaffProfile manager = staffProfileRepository.findByUserId(managerUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ người quản lý", managerUserId));

        if (request.getCheckIn() != null && request.getCheckOut() != null && request.getCheckOut().isBefore(request.getCheckIn())) {
            throw new BusinessException("INVALID_TIMEKEEPING_TIMES", "Thời gian check-out không được sớm hơn check-in");
        }

        if (request.getCheckIn() != null) {
            timekeeping.setCheckIn(request.getCheckIn());
        }
        if (request.getCheckOut() != null) {
            timekeeping.setCheckOut(request.getCheckOut());
        }

        timekeeping.setIsAdjusted(true);
        timekeeping.setAdjustedByStaff(manager);
        timekeeping.setAdjustmentReason(request.getAdjustmentReason());

        Timekeeping saved = timekeepingRepository.save(timekeeping);
        return TimekeepingResponse.fromEntity(saved);
    }
}
