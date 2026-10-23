package com.smart_cafe_ai.payment_service.service.impl;

import com.smart_cafe_ai.payment_service.dto.event.RefundProcessedEvent;
import com.smart_cafe_ai.payment_service.dto.refund.CreateRefundRequest;
import com.smart_cafe_ai.payment_service.dto.refund.ProcessRefundRequest;
import com.smart_cafe_ai.payment_service.dto.refund.RefundResponse;
import com.smart_cafe_ai.payment_service.entity.*;
import com.smart_cafe_ai.payment_service.enums.CashierShiftStatus;
import com.smart_cafe_ai.payment_service.enums.PaymentStatus;
import com.smart_cafe_ai.payment_service.enums.RefundMethod;
import com.smart_cafe_ai.payment_service.enums.RefundStatus;
import com.smart_cafe_ai.payment_service.exception.BusinessException;
import com.smart_cafe_ai.payment_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.payment_service.repository.CashierShiftRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentRepository;
import com.smart_cafe_ai.payment_service.repository.RefundRepository;
import com.smart_cafe_ai.payment_service.service.OutboxService;
import com.smart_cafe_ai.payment_service.service.RefundService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RefundServiceImpl implements RefundService {

    private final RefundRepository refundRepository;
    private final PaymentRepository paymentRepository;
    private final CashierShiftRepository cashierShiftRepository;
    private final OutboxService outboxService;

    @Override
    @Transactional
    public RefundResponse createRefund(CreateRefundRequest request, String requestedBy) {
        Payment payment = paymentRepository.findById(request.getPaymentId())
                .orElseThrow(() -> new ResourceNotFoundException("Giao dịch thanh toán", request.getPaymentId()));

        if (payment.getStatus() != PaymentStatus.Success) {
            throw new BusinessException("PAYMENT_NOT_SUCCESS", "Chỉ có thể hoàn tiền cho giao dịch đã thanh toán thành công", HttpStatus.BAD_REQUEST);
        }

        BigDecimal maxRefundable = payment.getAmount().subtract(payment.getRefundedAmount());
        if (request.getAmount().compareTo(maxRefundable) > 0) {
            throw new BusinessException("INVALID_AMOUNT", "Số tiền yêu cầu hoàn (" + request.getAmount() + ") vượt quá số tiền còn lại có thể hoàn (" + maxRefundable + ")", HttpStatus.CONFLICT);
        }

        RefundMethod method = request.getRefundMethod() != null
                ? request.getRefundMethod()
                : RefundMethod.valueOf(payment.getPaymentMethod().name());

        Refund refund = Refund.builder()
                .paymentId(payment.getId())
                .refundMethod(method)
                .amount(request.getAmount())
                .reason(request.getReason())
                .status(RefundStatus.Pending)
                .requestedBy(requestedBy)
                .build();

        // Allocations mapping
        if (payment.getAllocations() != null) {
            for (PaymentOrderAllocation poa : payment.getAllocations()) {
                RefundOrderAllocation roa = RefundOrderAllocation.builder()
                        .refund(refund)
                        .orderId(poa.getOrderId())
                        .amount(request.getAmount())
                        .restockInventory(false)
                        .reverseLoyalty(true)
                        .build();
                refund.getAllocations().add(roa);
            }
        }

        refund = refundRepository.save(refund);
        log.info("Created refund request #{} for payment #{} amount {}", refund.getId(), payment.getId(), refund.getAmount());

        return mapToResponse(refund);
    }

    @Override
    @Transactional
    public RefundResponse processRefund(Long id, ProcessRefundRequest request, String staffUserId) {
        Refund refund = refundRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Yêu cầu hoàn tiền", id));

        if (refund.getStatus() != RefundStatus.Pending && refund.getStatus() != RefundStatus.Approved) {
            throw new BusinessException("REFUND_ALREADY_PROCESSED", "Yêu cầu hoàn tiền đã được xử lý (trạng thái: " + refund.getStatus() + ")", HttpStatus.BAD_REQUEST);
        }

        String action = request.getAction().toUpperCase();
        if ("REJECT".equals(action)) {
            refund.setStatus(RefundStatus.Rejected);
            refund.setProcessedBy(staffUserId);
            refund.setProcessedAt(LocalDateTime.now());
            refund = refundRepository.save(refund);
            log.info("Refund #{} rejected by staff {}", id, staffUserId);
            return mapToResponse(refund);
        }

        if ("APPROVE".equals(action) || "PROCESS".equals(action)) {
            Long paymentId = refund.getPaymentId();
            Payment payment = paymentRepository.findById(paymentId)
                    .orElseThrow(() -> new ResourceNotFoundException("Giao dịch thanh toán", paymentId));

            // Nếu hoàn tiền mặt, phải ghi nhận qua ca thu ngân
            if (refund.getRefundMethod() == RefundMethod.Cash) {
                CashierShift shift = cashierShiftRepository.findFirstByStaffUserIdAndStatus(staffUserId, CashierShiftStatus.Open)
                        .orElseThrow(() -> new BusinessException("NO_OPEN_SHIFT", "Nhân viên chưa mở ca thu ngân để thực hiện chi tiền hoàn", HttpStatus.CONFLICT));

                refund.setCashierShiftId(shift.getId());
                shift.setTotalCashRefunds(shift.getTotalCashRefunds().add(refund.getAmount()));
                cashierShiftRepository.save(shift);
            }

            // Cập nhật payment refundedAmount
            payment.setRefundedAmount(payment.getRefundedAmount().add(refund.getAmount()));
            paymentRepository.save(payment);

            refund.setStatus(RefundStatus.Processed);
            refund.setApprovedBy(staffUserId);
            refund.setProcessedBy(staffUserId);
            refund.setProcessedAt(LocalDateTime.now());
            refund.setRefundTransactionId("REFUND_" + System.currentTimeMillis());
            refund = refundRepository.save(refund);

            // Bắn Outbox Event
            publishRefundProcessedEvent(refund);
            log.info("Refund #{} processed successfully for amount {}", id, refund.getAmount());

            return mapToResponse(refund);
        }

        throw new BusinessException("INVALID_ACTION", "Hành động xử lý không hợp lệ. Chỉ chấp nhận APPROVE, REJECT, PROCESS", HttpStatus.BAD_REQUEST);
    }

    @Override
    @Transactional(readOnly = true)
    public RefundResponse getRefundById(Long id) {
        Refund refund = refundRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Yêu cầu hoàn tiền", id));
        return mapToResponse(refund);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<RefundResponse> getRefunds(RefundStatus status, Pageable pageable) {
        Page<Refund> page = status != null
                ? refundRepository.findByStatus(status, pageable)
                : refundRepository.findAll(pageable);
        return page.map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<RefundResponse> getMyRefunds(String requestedBy, Pageable pageable) {
        Page<Refund> page = refundRepository.findByRequestedBy(requestedBy, pageable);
        return page.map(this::mapToResponse);
    }

    private void publishRefundProcessedEvent(Refund refund) {
        List<Long> orderIds = refund.getAllocations().stream()
                .map(RefundOrderAllocation::getOrderId)
                .collect(Collectors.toList());

        RefundProcessedEvent event = RefundProcessedEvent.builder()
                .eventId(UUID.randomUUID().toString())
                .refundId(refund.getId())
                .paymentId(refund.getPaymentId())
                .amount(refund.getAmount())
                .orderIds(orderIds)
                .restockInventory(false)
                .reverseLoyalty(true)
                .processedAt(refund.getProcessedAt())
                .build();

        outboxService.recordEvent("Refund", refund.getId().toString(), "RefundProcessed", event);
    }

    private RefundResponse mapToResponse(Refund refund) {
        return RefundResponse.builder()
                .id(refund.getId())
                .paymentId(refund.getPaymentId())
                .refundMethod(refund.getRefundMethod())
                .cashierShiftId(refund.getCashierShiftId())
                .amount(refund.getAmount())
                .reason(refund.getReason())
                .status(refund.getStatus())
                .requestedBy(refund.getRequestedBy())
                .approvedBy(refund.getApprovedBy())
                .processedBy(refund.getProcessedBy())
                .processedAt(refund.getProcessedAt())
                .refundTransactionId(refund.getRefundTransactionId())
                .createdAt(refund.getCreatedAt())
                .build();
    }
}
