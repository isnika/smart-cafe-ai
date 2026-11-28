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
import java.time.LocalDateTime;
import java.time.ZoneId;
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
    private final com.smart_cafe_ai.store_service.security.BranchScope branchScope;

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleResponse> getSchedules(Integer branchId, Long staffId, Integer shiftId, LocalDate from, LocalDate to, ScheduleStatus status) {
        LocalDate startDate = from != null ? from : LocalDate.now().minusDays(7);
        LocalDate endDate = to != null ? to : LocalDate.now().plusDays(14);

        List<Schedule> schedules = scheduleRepository.findSchedulesFiltered(branchScope.restrict(branchId), staffId, shiftId, status, startDate, endDate);
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
        StaffProfile staff = staffProfileRepository.lockById(request.getStaffId())
                .orElseThrow(() -> new ResourceNotFoundException("Nhân viên", request.getStaffId()));

        Shift shift = shiftRepository.findById(request.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", request.getShiftId()));

        branchScope.check(staff.getBranch().getId());
        branchScope.check(shift.getBranch().getId());
        if (staff.getStatus() != com.smart_cafe_ai.store_service.enums.StaffStatus.Active || !Boolean.TRUE.equals(shift.getIsActive()))
            throw new BusinessException("INACTIVE", "Nhân viên và ca phải đang hoạt động");

        if (!shift.getBranch().getId().equals(staff.getBranch().getId())) {
            throw new BusinessException("BRANCH_MISMATCH", "Ca làm việc và nhân viên không thuộc cùng một chi nhánh");
        }

        checkFuture(shift, request.getWorkDate());
        checkOverlap(staff.getId(), shift, request.getWorkDate(), null);

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
            } catch (org.springframework.security.access.AccessDeniedException e) {
                throw e;
            } catch (BusinessException | ResourceNotFoundException e) {
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

        branchScope.check(schedule.getBranchId());
        staffProfileRepository.lockById(schedule.getStaff().getId()).orElseThrow();
        checkEditable(schedule);

        Shift shift = shiftRepository.findById(request.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Ca làm việc", request.getShiftId()));

        branchScope.check(shift.getBranch().getId());
        if (!Boolean.TRUE.equals(shift.getIsActive()) || schedule.getStaff().getStatus() != com.smart_cafe_ai.store_service.enums.StaffStatus.Active)
            throw new BusinessException("INACTIVE", "Nhân viên và ca phải đang hoạt động");

        if (!shift.getBranch().getId().equals(schedule.getBranchId())) {
            throw new BusinessException("BRANCH_MISMATCH", "Ca làm việc mới không thuộc cùng chi nhánh của lịch");
        }

        checkFuture(shift, request.getWorkDate());
        checkOverlap(schedule.getStaff().getId(), shift, request.getWorkDate(), id);

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

        branchScope.check(schedule.getBranchId());
        checkEditable(schedule);

        schedule.setStatus(status);
        Schedule saved = scheduleRepository.save(schedule);
        return ScheduleResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public void deleteSchedule(Long id) {
        Schedule schedule = scheduleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lịch làm việc", id));

        branchScope.check(schedule.getBranchId());
        checkEditable(schedule);

        if (timekeepingRepository.findByScheduleId(id).isPresent()) {
            throw new BusinessException("SCHEDULE_HAS_TIMEKEEPING", "Không thể xóa lịch làm việc đã có bản ghi chấm công");
        }

        scheduleRepository.delete(schedule);
    }

    private LocalDateTime start(Shift shift, LocalDate date) { return date.atTime(shift.getStartTime().toLocalTime()); }
    private LocalDateTime end(Shift shift, LocalDate date) {
        LocalDateTime start = start(shift, date);
        LocalDateTime end = date.atTime(shift.getEndTime().toLocalTime());
        return end.isBefore(start) ? end.plusDays(1) : end;
    }
    private void checkFuture(Shift shift, LocalDate date) {
        if (!start(shift, date).isAfter(LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"))))
            throw new BusinessException("SCHEDULE_STARTED", "Ca đã bắt đầu");
    }
    private void checkEditable(Schedule schedule) {
        if (schedule.getStatus() != ScheduleStatus.Scheduled || timekeepingRepository.findByScheduleId(schedule.getId()).isPresent())
            throw new BusinessException("SCHEDULE_STARTED", "Không thể sửa lịch đã bắt đầu hoặc hoàn thành");
        checkFuture(schedule.getShift(), schedule.getWorkDate());
    }
    private void checkOverlap(Long staffId, Shift shift, LocalDate date, Long excludedId) {
        LocalDateTime start = start(shift, date), end = end(shift, date);
        for (Schedule other : scheduleRepository.findForOverlap(staffId, date.minusDays(1), date.plusDays(1))) {
            if (other.getId().equals(excludedId) || other.getStatus() == ScheduleStatus.Leave) continue;
            if (start.isBefore(end(other.getShift(), other.getWorkDate())) && end.isAfter(start(other.getShift(), other.getWorkDate())))
                throw new BusinessException("SCHEDULE_CONFLICT", "Lịch làm việc bị trùng giờ");
        }
    }
}
