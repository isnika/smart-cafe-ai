package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.schedule.ScheduleBulkRequest;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleBulkResponse;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleRequest;
import com.smart_cafe_ai.store_service.dto.schedule.ScheduleResponse;
import com.smart_cafe_ai.store_service.entity.Schedule;
import com.smart_cafe_ai.store_service.entity.Shift;
import com.smart_cafe_ai.store_service.entity.StaffProfile;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.ScheduleRepository;
import com.smart_cafe_ai.store_service.repository.ShiftRepository;
import com.smart_cafe_ai.store_service.repository.StaffProfileRepository;
import com.smart_cafe_ai.store_service.repository.TimekeepingRepository;
import com.smart_cafe_ai.store_service.service.ScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ScheduleServiceImpl implements ScheduleService {

    private final ScheduleRepository scheduleRepository;
    private final StaffProfileRepository staffProfileRepository;
    private final ShiftRepository shiftRepository;
    private final TimekeepingRepository timekeepingRepository;

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleResponse> getSchedules(Integer branchId, Long staffId, Integer shiftId, LocalDate from, LocalDate to, ScheduleStatus status) {
        LocalDate startDate = from != null ? from : LocalDate.now().minusDays(7);
        LocalDate endDate = to != null ? to : LocalDate.now().plusDays(14);

        List<Schedule> schedules = scheduleRepository.findSchedulesFiltered(branchId, staffId, shiftId, status, startDate, endDate);
        return schedules.stream()
                .map(ScheduleResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleResponse> getMySchedules(String userId, LocalDate from, LocalDate to) {
        StaffProfile staff = staffProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Hồ sơ nhân viên với user_id", userId));

        LocalDate startDate = from != null ? from : LocalDate.now().minusDays(7);
        LocalDate endDate = to != null ? to : LocalDate.now().plusDays(14);

        List<Schedule> schedules = scheduleRepository.findSchedulesFiltered(null, staff.getId(), null, null, startDate, endDate);
        return schedules.stream()
                .map(ScheduleResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public ScheduleResponse createSchedule(ScheduleRequest request) {
        StaffProfile staff = staffProfileRepository.findById(request.getStaffId())
                .orElseThrow(() -> new ResourceNotFoundException("Nhân viên", request.getStaffId()));

        Shift shift = shiftRepository.findById(request.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", request.getShiftId()));

        if (!shift.getBranch().getId().equals(staff.getBranch().getId())) {
            throw new BusinessException("BRANCH_MISMATCH", "Ca làm việc và nhân viên không thuộc cùng một chi nhánh");
        }

        if (scheduleRepository.existsByStaffIdAndWorkDate(staff.getId(), request.getWorkDate())) {
            throw new BusinessException("SCHEDULE_EXISTS", "Nhân viên đã được phân ca trong ngày " + request.getWorkDate());
        }

        Schedule schedule = Schedule.builder()
                .branchId(staff.getBranch().getId())
                .staff(staff)
                .shift(shift)
                .workDate(request.getWorkDate())
                .status(ScheduleStatus.Scheduled)
                .build();

        Schedule saved = scheduleRepository.save(schedule);
        return ScheduleResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public ScheduleBulkResponse createSchedulesBulk(ScheduleBulkRequest request) {
        int createdCount = 0;
        List<String> conflicts = new ArrayList<>();

        for (ScheduleRequest item : request.getItems()) {
            try {
                createSchedule(item);
                createdCount++;
            } catch (Exception e) {
                conflicts.add("staffId=" + item.getStaffId() + ", shiftId=" + item.getShiftId() + ", date=" + item.getWorkDate() + ": " + e.getMessage());
            }
        }

        return ScheduleBulkResponse.builder()
                .createdCount(createdCount)
                .conflicts(conflicts)
                .build();
    }

    @Override
    @Transactional
    public ScheduleResponse updateSchedule(Long id, ScheduleRequest request) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lịch làm việc", id));

        Shift shift = shiftRepository.findById(request.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", request.getShiftId()));

        if (!shift.getBranch().getId().equals(schedule.getBranchId())) {
            throw new BusinessException("BRANCH_MISMATCH", "Ca làm việc mới không thuộc cùng chi nhánh của lịch");
        }

        if (!schedule.getWorkDate().equals(request.getWorkDate()) &&
                scheduleRepository.existsByStaffIdAndWorkDate(schedule.getStaff().getId(), request.getWorkDate())) {
            throw new BusinessException("SCHEDULE_EXISTS", "Nhân viên đã có ca khác trong ngày " + request.getWorkDate());
        }

        schedule.setShift(shift);
        schedule.setWorkDate(request.getWorkDate());

        Schedule saved = scheduleRepository.save(schedule);
        return ScheduleResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public ScheduleResponse updateScheduleStatus(Long id, ScheduleStatus status) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lịch làm việc", id));

        schedule.setStatus(status);
        Schedule saved = scheduleRepository.save(schedule);
        return ScheduleResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public void deleteSchedule(Long id) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lịch làm việc", id));

        if (timekeepingRepository.findByScheduleId(id).isPresent()) {
            throw new BusinessException("SCHEDULE_HAS_TIMEKEEPING", "Không thể xóa lịch làm việc đã có bản ghi chấm công");
        }

        scheduleRepository.delete(schedule);
    }
}
