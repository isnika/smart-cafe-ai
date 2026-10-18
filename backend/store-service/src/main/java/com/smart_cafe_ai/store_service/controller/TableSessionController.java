package com.smart_cafe_ai.store_service.controller;

import com.smart_cafe_ai.store_service.dto.ApiResponse;
import com.smart_cafe_ai.store_service.dto.session.TableSessionResponse;
import com.smart_cafe_ai.store_service.dto.session.TableSessionStatusRequest;
import com.smart_cafe_ai.store_service.dto.table.CafeTableResponse;
import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import com.smart_cafe_ai.store_service.service.TableSessionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class TableSessionController {

    private final TableSessionService tableSessionService;

    /**
     * GET /qr/{qr_code}
     * Khách quét QR code để lấy thông tin bàn & chi nhánh. (Public)
     */
    @GetMapping({"/qr/{qr_code}", "/api/v1/qr/{qr_code}"})
    public ResponseEntity<ApiResponse<CafeTableResponse>> getTableByQrCode(@PathVariable("qr_code") String qrCode) {
        CafeTableResponse table = tableSessionService.getTableByQrCode(qrCode);
        return ResponseEntity.ok(ApiResponse.success(table));
    }

    /**
     * POST /qr/{qr_code}/sessions
     * Tạo mới hoặc tham gia phiên mở hiện tại của bàn. (Public / Customer / Guest)
     */
    @PostMapping({"/qr/{qr_code}/sessions", "/api/v1/qr/{qr_code}/sessions"})
    public ResponseEntity<ApiResponse<TableSessionResponse>> getOrCreateSession(
            @PathVariable("qr_code") String qrCode,
            Authentication authentication
    ) {
        String customerId = authentication != null ? authentication.getName() : null;
        TableSessionResponse session = tableSessionService.getOrCreateSessionByQrCode(qrCode, customerId);
        return ResponseEntity.status(HttpStatus.OK).body(ApiResponse.success(session));
    }

    /**
     * GET /table-sessions/current
     * Lấy phiên hiện tại từ Header X-Table-Session-Code. (Guest/Customer)
     */
    @GetMapping({"/table-sessions/current", "/api/v1/table-sessions/current"})
    public ResponseEntity<ApiResponse<TableSessionResponse>> getCurrentSession(
            @RequestHeader(value = "X-Table-Session-Code", required = false) String sessionCode
    ) {
        TableSessionResponse session = tableSessionService.getCurrentSessionByCode(sessionCode);
        return ResponseEntity.ok(ApiResponse.success(session));
    }

    /**
     * POST /table-sessions/current/request-payment
     * Chuyển trạng thái phiên Active -> Payment_Pending khi khách yêu cầu tính tiền. (Guest/Customer)
     */
    @PostMapping({"/table-sessions/current/request-payment", "/api/v1/table-sessions/current/request-payment"})
    public ResponseEntity<ApiResponse<TableSessionResponse>> requestPayment(
            @RequestHeader(value = "X-Table-Session-Code", required = false) String sessionCode
    ) {
        TableSessionResponse session = tableSessionService.requestPayment(sessionCode);
        return ResponseEntity.ok(ApiResponse.success(session));
    }

    /**
     * GET /table-sessions
     * Nhân viên xem các phiên bàn theo chi nhánh. (Staff/Manager)
     */
    @GetMapping({"/table-sessions", "/api/v1/table-sessions"})
    public ResponseEntity<ApiResponse<List<TableSessionResponse>>> getSessionsByBranch(
            @RequestParam("branch_id") Integer branchId,
            @RequestParam(value = "status", required = false) List<TableSessionStatus> statuses
    ) {
        List<TableSessionResponse> sessions = tableSessionService.getSessionsByBranch(branchId, statuses);
        return ResponseEntity.ok(ApiResponse.success(sessions));
    }

    /**
     * PATCH /table-sessions/{id}/status
     * Đóng / Hủy / Đổi trạng thái phiên làm việc. (Staff/Manager)
     */
    @PatchMapping({"/table-sessions/{id}/status", "/api/v1/table-sessions/{id}/status"})
    public ResponseEntity<ApiResponse<TableSessionResponse>> updateSessionStatus(
            @PathVariable Long id,
            @RequestBody TableSessionStatusRequest request
    ) {
        TableSessionResponse session = tableSessionService.updateSessionStatus(id, request.getStatus());
        return ResponseEntity.ok(ApiResponse.success(session));
    }

    /**
     * GET /internal/table-sessions/{id}
     * Order/Payment Service gọi API nội bộ kiểm tra phiên bàn. (Internal)
     */
    @GetMapping({"/internal/table-sessions/{id}", "/api/v1/internal/table-sessions/{id}"})
    public ResponseEntity<ApiResponse<TableSessionResponse>> getSessionInternal(@PathVariable Long id) {
        TableSessionResponse session = tableSessionService.getSessionByIdInternal(id);
        return ResponseEntity.ok(ApiResponse.success(session));
    }
}
