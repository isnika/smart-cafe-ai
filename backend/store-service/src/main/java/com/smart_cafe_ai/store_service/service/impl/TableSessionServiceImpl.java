package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.session.TableSessionResponse;
import com.smart_cafe_ai.store_service.dto.table.CafeTableResponse;
import com.smart_cafe_ai.store_service.entity.CafeTable;
import com.smart_cafe_ai.store_service.entity.TableSession;
import com.smart_cafe_ai.store_service.enums.BranchStatus;
import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.CafeTableRepository;
import com.smart_cafe_ai.store_service.repository.TableSessionRepository;
import com.smart_cafe_ai.store_service.service.TableSessionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TableSessionServiceImpl implements TableSessionService {

    private final CafeTableRepository cafeTableRepository;
    private final TableSessionRepository tableSessionRepository;

    @Override
    @Transactional(readOnly = true)
    public CafeTableResponse getTableByQrCode(String qrCode) {
        CafeTable table = cafeTableRepository.findByQrCodeWithBranch(qrCode)
                .orElseThrow(() -> new ResourceNotFoundException("Mã QR không hợp lệ hoặc không tồn tại: " + qrCode));

        if (Boolean.FALSE.equals(table.getIsActive())) {
            throw new BusinessException("TABLE_INACTIVE", "Bàn hiện đang ngưng phục vụ");
        }
        if (table.getBranch() != null && table.getBranch().getStatus() == BranchStatus.Inactive) {
            throw new BusinessException("BRANCH_INACTIVE", "Chi nhánh hiện đang tạm đóng cửa");
        }

        return CafeTableResponse.fromEntity(table);
    }

    @Override
    @Transactional
    public TableSessionResponse getOrCreateSessionByQrCode(String qrCode, String customerId) {
        CafeTable table = cafeTableRepository.findByQrCodeWithBranch(qrCode)
                .orElseThrow(() -> new ResourceNotFoundException("Mã QR không hợp lệ: " + qrCode));

        if (Boolean.FALSE.equals(table.getIsActive())) {
            throw new BusinessException("TABLE_INACTIVE", "Bàn hiện đang ngưng phục vụ");
        }
        if (table.getBranch() != null && table.getBranch().getStatus() == BranchStatus.Inactive) {
            throw new BusinessException("BRANCH_INACTIVE", "Chi nhánh hiện đang đóng cửa");
        }

        // BR-STO-02: Kiểm tra phiên Active hoặc Payment_Pending đang mở của bàn
        Optional<TableSession> activeSessionOpt = tableSessionRepository.findByTableIdAndStatus(
                table.getId(), TableSessionStatus.Active
        );

        if (activeSessionOpt.isPresent()) {
            TableSession session = activeSessionOpt.get();
            // Nếu phiên chưa gắn customerId và request này có customerId thì cập nhật
            if (session.getCustomerId() == null && customerId != null) {
                session.setCustomerId(customerId);
                session = tableSessionRepository.save(session);
            }
            return TableSessionResponse.fromEntity(session);
        }

        // Tạo phiên làm việc mới
        String sessionCode = "SESS-" + UUID.randomUUID().toString().toUpperCase().replace("-", "").substring(0, 16);

        TableSession newSession = TableSession.builder()
                .table(table)
                .sessionCode(sessionCode)
                .customerId(customerId)
                .status(TableSessionStatus.Active)
                .openedAt(LocalDateTime.now())
                .expiresAt(LocalDateTime.now().plusHours(4)) // Default TTL 4h
                .build();

        TableSession saved = tableSessionRepository.save(newSession);
        return TableSessionResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public TableSessionResponse getCurrentSessionByCode(String sessionCode) {
        if (sessionCode == null || sessionCode.isBlank()) {
            throw new BusinessException("SESSION_CODE_REQUIRED", "Header X-Table-Session-Code không được trống");
        }
        TableSession session = tableSessionRepository.findBySessionCode(sessionCode)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiên làm việc: " + sessionCode));
        return TableSessionResponse.fromEntity(session);
    }

    @Override
    @Transactional
    public TableSessionResponse requestPayment(String sessionCode) {
        if (sessionCode == null || sessionCode.isBlank()) {
            throw new BusinessException("SESSION_CODE_REQUIRED", "Header X-Table-Session-Code không được trống");
        }

        TableSession session = tableSessionRepository.findBySessionCode(sessionCode)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiên làm việc: " + sessionCode));

        if (session.getStatus() != TableSessionStatus.Active) {
            throw new BusinessException("INVALID_STATE_TRANSITION", "Phiên phải ở trạng thái Active mới có thể gửi yêu cầu tính tiền");
        }

        session.setStatus(TableSessionStatus.Payment_Pending);
        TableSession saved = tableSessionRepository.save(session);
        return TableSessionResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TableSessionResponse> getSessionsByBranch(Integer branchId, List<TableSessionStatus> statuses) {
        if (statuses == null || statuses.isEmpty()) {
            statuses = List.of(TableSessionStatus.Active, TableSessionStatus.Payment_Pending);
        }
        List<TableSession> sessions = tableSessionRepository.findActiveSessionsByBranch(branchId, statuses);
        return sessions.stream()
                .map(TableSessionResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public TableSessionResponse updateSessionStatus(Long id, TableSessionStatus newStatus) {
        TableSession session = tableSessionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Phiên làm việc", id));

        // State Machine validation
        TableSessionStatus current = session.getStatus();
        if (current == TableSessionStatus.Completed || current == TableSessionStatus.Cancelled) {
            throw new BusinessException("SESSION_ALREADY_CLOSED", "Phiên đã kết thúc, không thể thay đổi trạng thái");
        }

        session.setStatus(newStatus);
        if (newStatus == TableSessionStatus.Completed || newStatus == TableSessionStatus.Cancelled) {
            session.setClosedAt(LocalDateTime.now());
        }

        TableSession saved = tableSessionRepository.save(session);
        return TableSessionResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public TableSessionResponse getSessionByIdInternal(Long id) {
        TableSession session = tableSessionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Phiên làm việc", id));
        return TableSessionResponse.fromEntity(session);
    }
}
