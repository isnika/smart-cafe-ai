package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.controller.LeaveRequestController;
import com.smart_cafe_ai.store_service.controller.ScheduleController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

@SpringJUnitConfig(WorkforceRoleSecurityTest.Config.class)
class WorkforceRoleSecurityTest {
    @Configuration
    @EnableMethodSecurity
    static class Config {
        @Bean ScheduleService scheduleService() { return mock(ScheduleService.class); }
        @Bean LeaveRequestService leaveRequestService() { return mock(LeaveRequestService.class); }
        @Bean ScheduleController scheduleController(ScheduleService service) { return new ScheduleController(service); }
        @Bean LeaveRequestController leaveRequestController(LeaveRequestService service) { return new LeaveRequestController(service); }
    }

    @Autowired ScheduleController schedules;
    @Autowired LeaveRequestController leave;

    private Authentication authenticate(String role) {
        Authentication authentication = new UsernamePasswordAuthenticationToken("employee", "token",
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        return authentication;
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @ParameterizedTest
    @ValueSource(strings = {"STAFF", "CASHIER", "BARISTA"})
    void employeeRolesCanAccessOwnWorkforceEndpoints(String role) {
        Authentication auth = authenticate(role);
        assertDoesNotThrow(() -> schedules.getMySchedules(auth, null, null));
        assertDoesNotThrow(() -> schedules.confirmSchedule(1L, auth));
        assertDoesNotThrow(() -> leave.getMyLeaveRequests(auth, null));
        assertDoesNotThrow(() -> leave.createLeaveRequest(null, auth));
        assertDoesNotThrow(() -> leave.cancelLeaveRequest(1L, auth));
        assertThrows(AccessDeniedException.class, () -> schedules.getSchedules(null, null, null, null, null, null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ADMIN", "MANAGER", "CUSTOMER"})
    void nonEmployeeRolesCannotConfirmForSomeoneElse(String role) {
        Authentication auth = authenticate(role);
        assertThrows(AccessDeniedException.class, () -> schedules.confirmSchedule(1L, auth));
    }
}
