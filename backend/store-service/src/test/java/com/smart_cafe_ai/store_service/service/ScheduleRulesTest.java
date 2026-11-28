package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.schedule.ScheduleRequest;
import com.smart_cafe_ai.store_service.entity.*;
import com.smart_cafe_ai.store_service.enums.StaffStatus;
import com.smart_cafe_ai.store_service.enums.ScheduleStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.repository.*;
import com.smart_cafe_ai.store_service.security.BranchScope;
import com.smart_cafe_ai.store_service.service.impl.ScheduleServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ScheduleRulesTest {
    ScheduleRepository schedules = mock(ScheduleRepository.class);
    StaffProfileRepository staffRepository = mock(StaffProfileRepository.class);
    ShiftRepository shifts = mock(ShiftRepository.class);
    TimekeepingRepository timekeeping = mock(TimekeepingRepository.class);
    BranchScope scope = mock(BranchScope.class);
    ScheduleServiceImpl service = new ScheduleServiceImpl(schedules, staffRepository, shifts, timekeeping, scope);
    Branch branch = Branch.builder().id(1).build();
    StaffProfile staff = StaffProfile.builder().id(1L).branch(branch).status(StaffStatus.Active).build();
    LocalDate date = LocalDate.now().plusDays(10);
    Shift shift(String start, String end) { return Shift.builder().id(1).branch(branch).name("Test").startTime(Time.valueOf(start)).endTime(Time.valueOf(end)).isActive(true).build(); }

    @BeforeEach void setup() {
        when(staffRepository.lockById(1L)).thenReturn(Optional.of(staff));
        when(schedules.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    @Test void rejectsOvernightOverlapOnFollowingDay() {
        Shift night = shift("22:00:00", "02:00:00");
        when(shifts.findById(1)).thenReturn(Optional.of(shift("01:00:00", "04:00:00")));
        when(schedules.findForOverlap(eq(1L), any(), any())).thenReturn(List.of(
                Schedule.builder().id(5L).staff(staff).shift(night).workDate(date.minusDays(1)).build()));
        assertThrows(BusinessException.class, () -> service.createSchedule(new ScheduleRequest(1L, 1, date)));
    }

    @Test void acceptsAdjacentShifts() {
        when(shifts.findById(1)).thenReturn(Optional.of(shift("02:00:00", "06:00:00")));
        when(schedules.findForOverlap(1L, date.minusDays(1), date.plusDays(1))).thenReturn(List.of(
                Schedule.builder().id(5L).staff(staff).shift(shift("22:00:00", "02:00:00")).workDate(date.minusDays(1)).build()));
        assertDoesNotThrow(() -> service.createSchedule(new ScheduleRequest(1L, 1, date)));
    }

    @Test void acceptsNonOverlappingShiftsOnSameDay() {
        when(shifts.findById(1)).thenReturn(Optional.of(shift("12:00:00", "18:00:00")));
        when(schedules.findForOverlap(eq(1L), any(), any())).thenReturn(List.of(
                Schedule.builder().id(5L).staff(staff).shift(shift("06:00:00", "12:00:00")).workDate(date).build()));
        assertDoesNotThrow(() -> service.createSchedule(new ScheduleRequest(1L, 1, date)));
    }

    @Test void rejectsOverlappingShiftsOnSameDay() {
        when(shifts.findById(1)).thenReturn(Optional.of(shift("11:00:00", "18:00:00")));
        when(schedules.findForOverlap(eq(1L), any(), any())).thenReturn(List.of(
                Schedule.builder().id(5L).staff(staff).shift(shift("06:00:00", "12:00:00")).workDate(date).build()));
        assertThrows(BusinessException.class, () -> service.createSchedule(new ScheduleRequest(1L, 1, date)));
    }

    @Test void rejectsInactiveEmployee() {
        staff.setStatus(StaffStatus.Inactive);
        when(shifts.findById(1)).thenReturn(Optional.of(shift("08:00:00", "12:00:00")));
        assertThrows(BusinessException.class, () -> service.createSchedule(new ScheduleRequest(1L, 1, date)));
    }

    @Test void rejectsDeletingStartedSchedule() {
        Schedule existing = Schedule.builder().id(5L).branchId(1).staff(staff)
                .shift(shift("08:00:00", "12:00:00")).workDate(date.minusDays(20)).build();
        when(schedules.findStaffIdByScheduleId(5L)).thenReturn(Optional.of(1L));
        when(schedules.lockById(5L)).thenReturn(Optional.of(existing));
        assertThrows(BusinessException.class, () -> service.deleteSchedule(5L));
        verify(schedules, never()).delete(any());
    }

    private Schedule futureSchedule() {
        Schedule schedule = Schedule.builder().id(5L).branchId(1).staff(staff)
                .shift(shift("08:00:00", "12:00:00")).workDate(date).build();
        when(schedules.findStaffIdByScheduleId(5L)).thenReturn(Optional.of(1L));
        when(schedules.lockById(5L)).thenReturn(Optional.of(schedule));
        when(staffRepository.findByUserId("employee")).thenReturn(Optional.of(staff));
        return schedule;
    }

    @Test void confirmationIsIdempotentAndDoesNotChangeExecutionStatus() {
        Schedule schedule = futureSchedule();
        service.confirmSchedule(5L, "employee");
        LocalDateTime confirmed = schedule.getConfirmedAt();
        assertNotNull(confirmed);
        service.confirmSchedule(5L, "employee");
        assertEquals(confirmed, schedule.getConfirmedAt());
        assertEquals(ScheduleStatus.Scheduled, schedule.getStatus());
        verify(schedules, times(1)).save(schedule);
    }

    @Test void cannotConfirmAnotherEmployeesSchedule() {
        futureSchedule();
        when(staffRepository.findByUserId("other")).thenReturn(Optional.of(StaffProfile.builder().id(9L).build()));
        assertThrows(org.springframework.security.access.AccessDeniedException.class, () -> service.confirmSchedule(5L, "other"));
        verify(schedules, never()).save(any());
    }

    @Test void cancelledAndStartedSchedulesCannotBeConfirmed() {
        Schedule schedule = futureSchedule();
        schedule.setStatus(ScheduleStatus.Cancelled);
        assertThrows(BusinessException.class, () -> service.confirmSchedule(5L, "employee"));
        schedule.setStatus(ScheduleStatus.Scheduled);
        schedule.setWorkDate(date.minusDays(20));
        assertThrows(BusinessException.class, () -> service.confirmSchedule(5L, "employee"));
    }

    @Test void cancellationPreservesScheduleAndPreventsConfirmation() {
        Schedule schedule = futureSchedule();
        service.deleteSchedule(5L);
        assertEquals(ScheduleStatus.Cancelled, schedule.getStatus());
        assertThrows(BusinessException.class, () -> service.confirmSchedule(5L, "employee"));
        verify(schedules, never()).delete(any());
    }

    @Test void changingShiftResetsConfirmation() {
        Schedule schedule = futureSchedule();
        schedule.setConfirmedAt(LocalDateTime.now());
        Shift replacement = shift("12:00:00", "18:00:00");
        replacement.setId(2);
        when(shifts.findById(2)).thenReturn(Optional.of(replacement));
        service.updateSchedule(5L, new ScheduleRequest(1L, 2, date));
        assertNull(schedule.getConfirmedAt());
    }
}
