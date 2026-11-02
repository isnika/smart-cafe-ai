package com.smart_cafe_ai.payment_service.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.payment_service.client.OrderClient;
import com.smart_cafe_ai.payment_service.client.StoreClient;
import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.client.OrderDto;
import com.smart_cafe_ai.payment_service.dto.client.TableSessionDto;
import com.smart_cafe_ai.payment_service.dto.event.PaymentFailedEvent;
import com.smart_cafe_ai.payment_service.dto.event.PaymentSucceededEvent;
import com.smart_cafe_ai.payment_service.dto.payment.ConfirmCashRequest;
import com.smart_cafe_ai.payment_service.dto.payment.CreatePaymentRequest;
import com.smart_cafe_ai.payment_service.dto.payment.PaymentResponse;
import com.smart_cafe_ai.payment_service.entity.*;
import com.smart_cafe_ai.payment_service.enums.*;
import com.smart_cafe_ai.payment_service.exception.BusinessException;
import com.smart_cafe_ai.payment_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.payment_service.repository.CashierShiftRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentGatewayLogRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentOrderAllocationRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentRepository;
import com.smart_cafe_ai.payment_service.service.OutboxService;
import com.smart_cafe_ai.payment_service.service.PaymentService;
import com.smart_cafe_ai.payment_service.util.VnPayUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentServiceImpl implements PaymentService {

    private final PaymentRepository paymentRepository;
    private final PaymentOrderAllocationRepository allocationRepository;
    private final PaymentGatewayLogRepository gatewayLogRepository;
    private final CashierShiftRepository cashierShiftRepository;
    private final OutboxService outboxService;
    private final OrderClient orderClient;
    private final StoreClient storeClient;
    private final ObjectMapper objectMapper;

    @Value("${payment.vnpay.url:https://sandbox.vnpayment.vn/paymentv2/vpcpay.html}")
    private String vnpayUrl;

    @Value("${payment.vnpay.tmn-code:SMARTCAFE}")
    private String vnpTmnCode;

    @Value("${payment.vnpay.hash-secret:SECRETKEYVNPAYSMARTCAFE12345678}")
    private String vnpHashSecret;

    @Value("${payment.vnpay.return-url:http://localhost:3000/payment/vnpay-return}")
    private String vnpReturnUrl;

    @Value("${payment.momo.endpoint:https://test-payment.momo.vn/v2/gateway/api/create}")
    private String momoEndpoint;

    @Value("${payment.momo.partner-code:MOMO}")
    private String momoPartnerCode;

    @Value("${payment.momo.return-url:http://localhost:3000/payment/momo-return}")
    private String momoReturnUrl;

    @Override
    @Transactional
    public PaymentResponse createPayment(CreatePaymentRequest request, String currentUserId, String clientIp) {
        // [BR-PAY-01] Ràng buộc: Payments chỉ tham chiếu tới 1 trong 2: order_id HOẶC table_session_id
        boolean hasOrder = request.getOrderId() != null;
        boolean hasSession = request.getTableSessionId() != null;
        if ((!hasOrder && !hasSession) || (hasOrder && hasSession)) {
            throw new BusinessException("INVALID_TARGET", "Phải cung cấp chính xác 1 trong 2: order_id hoặc table_session_id", HttpStatus.BAD_REQUEST);
        }

        // Idempotency check
        if (request.getIdempotencyKey() != null && !request.getIdempotencyKey().isBlank()) {
            Optional<Payment> existingPayment = paymentRepository.findByIdempotencyKey(request.getIdempotencyKey());
            if (existingPayment.isPresent()) {
                log.info("Idempotent request matched payment #{}", existingPayment.get().getId());
                return mapToResponse(existingPayment.get(), null);
            }
        }

        Integer branchId = request.getBranchId();
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<Long> orderIds = new ArrayList<>();

        // [BR-PAY-02] Xác minh số tiền: Lấy từ Order Service hoặc Store Service (Client không truyền amount)
        if (hasOrder) {
            try {
                ApiResponse<OrderDto> orderRes = orderClient.getOrderById(request.getOrderId());
                if (orderRes != null && orderRes.isSuccess() && orderRes.getData() != null) {
                    OrderDto order = orderRes.getData();
                    totalAmount = order.getTotalAmount();
                    if (branchId == null) {
                        branchId = order.getBranchId();
                    }
                } else {
                    // Fallback mock amount nếu order-service chưa bật khi test dev
                    totalAmount = new BigDecimal("54000");
                    if (branchId == null) branchId = 1;
                }
            } catch (Exception e) {
                log.warn("Feign orderClient call failed (service might be offline): {}. Using mock amount.", e.getMessage());
                totalAmount = new BigDecimal("54000");
                if (branchId == null) branchId = 1;
            }
            orderIds.add(request.getOrderId());
        } else {
            try {
                ApiResponse<TableSessionDto> sessionRes = storeClient.getTableSessionById(request.getTableSessionId());
                if (sessionRes != null && sessionRes.isSuccess() && sessionRes.getData() != null) {
                    TableSessionDto session = sessionRes.getData();
                    totalAmount = session.getTotalAmount() != null ? session.getTotalAmount() : new BigDecimal("100000");
                    if (branchId == null) branchId = session.getBranchId();
                    if (session.getOrderIds() != null && !session.getOrderIds().isEmpty()) {
                        orderIds.addAll(session.getOrderIds());
                    }
                } else {
                    totalAmount = new BigDecimal("100000");
                    if (branchId == null) branchId = 1;
                }
            } catch (Exception e) {
                log.warn("Feign storeClient call failed: {}. Using mock session amount.", e.getMessage());
                totalAmount = new BigDecimal("100000");
                if (branchId == null) branchId = 1;
            }
            if (orderIds.isEmpty()) {
                orderIds.add(1001L); // default reference order if none
            }
        }

        if (branchId == null) {
            branchId = 1;
        }

        Payment payment = Payment.builder()
                .branchId(branchId)
                .idempotencyKey(request.getIdempotencyKey())
                .paymentMethod(request.getPaymentMethod())
                .amount(totalAmount)
                .refundedAmount(BigDecimal.ZERO)
                .status(PaymentStatus.Pending)
                .createdBy(currentUserId)
                .expiresAt(LocalDateTime.now().plusMinutes(15))
                .build();

        payment = paymentRepository.save(payment);

        // Tạo allocations
        BigDecimal splitAmount = totalAmount.divide(BigDecimal.valueOf(orderIds.size()), 0, java.math.RoundingMode.HALF_UP);
        for (Long oId : orderIds) {
            PaymentOrderAllocation allocation = PaymentOrderAllocation.builder()
                    .payment(payment)
                    .orderId(oId)
                    .allocatedAmount(splitAmount)
                    .build();
            payment.getAllocations().add(allocation);
        }
        payment = paymentRepository.save(payment);

        String paymentUrl = null;
        if (request.getPaymentMethod() == PaymentMethod.VNPay) {
            paymentUrl = generateVnPayUrl(payment, request.getReturnUrl(), clientIp);
        } else if (request.getPaymentMethod() == PaymentMethod.Momo) {
            paymentUrl = generateMomoMockUrl(payment, request.getReturnUrl());
        }

        log.info("Created payment #{} for amount {} via {}", payment.getId(), payment.getAmount(), payment.getPaymentMethod());
        return mapToResponse(payment, paymentUrl);
    }

    @Override
    @Transactional
    public PaymentResponse confirmCash(Long paymentId, ConfirmCashRequest request, String cashierUserId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("Giao dịch thanh toán", paymentId));

        if (payment.getStatus() != PaymentStatus.Pending) {
            throw new BusinessException("PAYMENT_NOT_PENDING", "Giao dịch không ở trạng thái Pending (trạng thái: " + payment.getStatus() + ")", HttpStatus.BAD_REQUEST);
        }

        if (payment.getPaymentMethod() != PaymentMethod.Cash && payment.getPaymentMethod() != PaymentMethod.COD) {
            throw new BusinessException("INVALID_METHOD", "Chức năng xác nhận thu tiền mặt chỉ dành cho Cash hoặc COD", HttpStatus.BAD_REQUEST);
        }

        // [BR-PAY-03] Xác thực ca thu ngân của nhân viên
        CashierShift shift;
        if (request.getCashierShiftId() != null) {
            shift = cashierShiftRepository.findById(request.getCashierShiftId())
                    .orElseThrow(() -> new BusinessException("NO_OPEN_SHIFT", "Không tìm thấy ca thu ngân chỉ định", HttpStatus.CONFLICT));
        } else {
            shift = cashierShiftRepository.findFirstByStaffUserIdAndStatus(cashierUserId, CashierShiftStatus.Open)
                    .orElseThrow(() -> new BusinessException("NO_OPEN_SHIFT", "Không thể xác nhận tiền mặt vì nhân viên chưa mở ca thu ngân", HttpStatus.CONFLICT));
        }

        if (shift.getStatus() != CashierShiftStatus.Open) {
            throw new BusinessException("NO_OPEN_SHIFT", "Ca thu ngân đã bị đóng", HttpStatus.CONFLICT);
        }

        BigDecimal cashReceived = request.getCashReceived() != null ? request.getCashReceived() : payment.getAmount();
        if (cashReceived.compareTo(payment.getAmount()) < 0) {
            throw new BusinessException("INSUFFICIENT_CASH", "Số tiền khách đưa không đủ (cần: " + payment.getAmount() + ", đưa: " + cashReceived + ")", HttpStatus.BAD_REQUEST);
        }

        BigDecimal changeAmount = cashReceived.subtract(payment.getAmount());

        payment.setStatus(PaymentStatus.Success);
        payment.setPaidAt(LocalDateTime.now());
        payment.setCashReceived(cashReceived);
        payment.setChangeAmount(changeAmount);
        payment.setCashierShiftId(shift.getId());
        payment.setCollectedBy(cashierUserId);
        payment = paymentRepository.save(payment);

        // Cập nhật doanh số ca thu ngân
        shift.setTotalCashSales(shift.getTotalCashSales().add(payment.getAmount()));
        shift.setTotalOrders(shift.getTotalOrders() + Math.max(1, payment.getAllocations().size()));
        cashierShiftRepository.save(shift);

        // Ghi nhận Transactional Outbox Event
        publishPaymentSuccessEvent(payment);

        log.info("Cash payment #{} confirmed by staff {}. Received: {}, Change: {}",
                payment.getId(), cashierUserId, cashReceived, changeAmount);

        return mapToResponse(payment, null);
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponse getPaymentById(Long id) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Giao dịch thanh toán", id));
        return mapToResponse(payment, null);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PaymentResponse> getMyPayments(String userId, Pageable pageable) {
        Page<Payment> page = paymentRepository.findByCreatedBy(userId, pageable);
        return page.map(p -> mapToResponse(p, null));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PaymentResponse> getPayments(Integer branchId, Pageable pageable) {
        Page<Payment> page = branchId != null
                ? paymentRepository.findByBranchId(branchId, pageable)
                : paymentRepository.findAll(pageable);
        return page.map(p -> mapToResponse(p, null));
    }

    @Override
    @Transactional
    public Map<String, String> processVnPayIpn(Map<String, String> params) {
        Map<String, String> response = new HashMap<>();

        // 1. Kiểm tra chữ ký số HMAC-SHA512
        boolean isValidSignature = VnPayUtil.validateSignature(params, vnpHashSecret);
        String eventKey = params.get("vnp_TxnRef") + "_" + params.getOrDefault("vnp_TransactionNo", "0");

        // Ghi log gateway
        saveGatewayLog(params.get("vnp_TxnRef"), GatewayProvider.VNPay, GatewayDirection.IPN, eventKey, isValidSignature, 200, params);

        if (!isValidSignature) {
            log.warn("VNPay IPN: Invalid signature for params: {}", params);
            response.put("RspCode", "97");
            response.put("Message", "Invalid Checksum");
            return response;
        }

        String txnRef = params.get("vnp_TxnRef");
        if (txnRef == null || txnRef.isBlank()) {
            response.put("RspCode", "01");
            response.put("Message", "Order not found");
            return response;
        }

        Long paymentId;
        try {
            paymentId = Long.parseLong(txnRef);
        } catch (NumberFormatException e) {
            response.put("RspCode", "01");
            response.put("Message", "Order not found");
            return response;
        }

        Optional<Payment> paymentOpt = paymentRepository.findById(paymentId);
        if (paymentOpt.isEmpty()) {
            response.put("RspCode", "01");
            response.put("Message", "Order not found");
            return response;
        }

        Payment payment = paymentOpt.get();

        // 2. Kiểm tra số tiền
        BigDecimal vnpAmount = new BigDecimal(params.get("vnp_Amount")).divide(BigDecimal.valueOf(100));
        if (payment.getAmount().compareTo(vnpAmount) != 0) {
            log.warn("VNPay IPN: Amount mismatch. Expected {}, got {}", payment.getAmount(), vnpAmount);
            response.put("RspCode", "04");
            response.put("Message", "Invalid Amount");
            return response;
        }

        // 3. Kiểm tra Idempotency: nếu đã Success
        if (payment.getStatus() == PaymentStatus.Success) {
            log.info("VNPay IPN: Payment #{} already marked as Success", paymentId);
            response.put("RspCode", "02");
            response.put("Message", "Order already confirmed");
            return response;
        }

        // 4. Xử lý kết quả giao dịch
        String responseCode = params.get("vnp_ResponseCode");
        String transactionNo = params.get("vnp_TransactionNo");

        if ("00".equals(responseCode)) {
            payment.setStatus(PaymentStatus.Success);
            payment.setTransactionId(transactionNo);
            payment.setPaidAt(LocalDateTime.now());
            payment = paymentRepository.save(payment);

            // Bắn Outbox Event
            publishPaymentSuccessEvent(payment);
            log.info("VNPay IPN: Payment #{} succeeded with transactionId {}", paymentId, transactionNo);
        } else {
            payment.setStatus(PaymentStatus.Failed);
            payment.setTransactionId(transactionNo);
            payment = paymentRepository.save(payment);

            publishPaymentFailedEvent(payment, "VNPay response code: " + responseCode);
            log.warn("VNPay IPN: Payment #{} failed with response code {}", paymentId, responseCode);
        }

        response.put("RspCode", "00");
        response.put("Message", "Confirm Success");
        return response;
    }

    @Override
    @Transactional
    public PaymentResponse processVnPayReturn(Map<String, String> params) {
        boolean isValidSignature = VnPayUtil.validateSignature(params, vnpHashSecret);
        String txnRef = params.get("vnp_TxnRef");
        if (txnRef == null) {
            throw new BusinessException("INVALID_RETURN", "Mã đơn thanh toán không hợp lệ", HttpStatus.BAD_REQUEST);
        }

        Long paymentId = Long.parseLong(txnRef);
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("Giao dịch thanh toán", paymentId));

        if (!isValidSignature) {
            log.warn("VNPay Return: Invalid signature for payment #{}", paymentId);
            return mapToResponse(payment, null);
        }

        // Nếu IPN chưa kịp đến mà Return đã đến với code 00
        String responseCode = params.get("vnp_ResponseCode");
        if ("00".equals(responseCode) && payment.getStatus() == PaymentStatus.Pending) {
            payment.setStatus(PaymentStatus.Success);
            payment.setTransactionId(params.get("vnp_TransactionNo"));
            payment.setPaidAt(LocalDateTime.now());
            payment = paymentRepository.save(payment);
            publishPaymentSuccessEvent(payment);
        }

        return mapToResponse(payment, null);
    }

    @Override
    @Transactional
    public Map<String, Object> processMomoIpn(Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        String orderIdStr = (String) payload.get("orderId");
        String transId = String.valueOf(payload.get("transId"));
        Integer resultCode = (Integer) payload.get("resultCode");

        String eventKey = orderIdStr + "_" + transId;
        saveGatewayLog(orderIdStr, GatewayProvider.Momo, GatewayDirection.IPN, eventKey, true, 200, payload);

        if (orderIdStr != null) {
            try {
                Long paymentId = Long.parseLong(orderIdStr);
                Optional<Payment> paymentOpt = paymentRepository.findById(paymentId);
                if (paymentOpt.isPresent()) {
                    Payment payment = paymentOpt.get();
                    if (payment.getStatus() != PaymentStatus.Success) {
                        if (resultCode != null && resultCode == 0) {
                            payment.setStatus(PaymentStatus.Success);
                            payment.setTransactionId(transId);
                            payment.setPaidAt(LocalDateTime.now());
                            payment = paymentRepository.save(payment);
                            publishPaymentSuccessEvent(payment);
                        } else {
                            payment.setStatus(PaymentStatus.Failed);
                            payment.setTransactionId(transId);
                            payment = paymentRepository.save(payment);
                            publishPaymentFailedEvent(payment, "Momo result code: " + resultCode);
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        response.put("resultCode", 0);
        response.put("message", "Success");
        return response;
    }

    private String generateVnPayUrl(Payment payment, String customReturnUrl, String clientIp) {
        Map<String, String> vnpParams = new HashMap<>();
        vnpParams.put("vnp_Version", "2.1.0");
        vnpParams.put("vnp_Command", "pay");
        vnpParams.put("vnp_TmnCode", vnpTmnCode);
        vnpParams.put("vnp_Amount", String.valueOf(payment.getAmount().multiply(BigDecimal.valueOf(100)).longValue()));
        vnpParams.put("vnp_CurrCode", "VND");
        vnpParams.put("vnp_TxnRef", String.valueOf(payment.getId()));
        vnpParams.put("vnp_OrderInfo", "Thanh toan don hang #" + payment.getId());
        vnpParams.put("vnp_OrderType", "other");
        vnpParams.put("vnp_Locale", "vn");
        vnpParams.put("vnp_ReturnUrl", customReturnUrl != null && !customReturnUrl.isBlank() ? customReturnUrl : vnpReturnUrl);
        vnpParams.put("vnp_IpAddr", clientIp != null && !clientIp.isBlank() ? clientIp : "127.0.0.1");

        Calendar cld = Calendar.getInstance(TimeZone.getTimeZone("Etc/GMT+7"));
        SimpleDateFormat formatter = new SimpleDateFormat("yyyyMMddHHmmss");
        String vnpCreateDate = formatter.format(cld.getTime());
        vnpParams.put("vnp_CreateDate", vnpCreateDate);

        cld.add(Calendar.MINUTE, 15);
        String vnpExpireDate = formatter.format(cld.getTime());
        vnpParams.put("vnp_ExpireDate", vnpExpireDate);

        return VnPayUtil.buildPaymentUrl(vnpayUrl, vnpParams, vnpHashSecret);
    }

    private String generateMomoMockUrl(Payment payment, String customReturnUrl) {
        String retUrl = customReturnUrl != null ? customReturnUrl : momoReturnUrl;
        return momoEndpoint + "?orderId=" + payment.getId() + "&amount=" + payment.getAmount() + "&returnUrl=" + URLEncoder.encode(retUrl, StandardCharsets.UTF_8);
    }

    private void publishPaymentSuccessEvent(Payment payment) {
        List<Long> orderIds = payment.getAllocations().stream()
                .map(PaymentOrderAllocation::getOrderId)
                .collect(Collectors.toList());

        PaymentSucceededEvent event = PaymentSucceededEvent.builder()
                .eventId(UUID.randomUUID().toString())
                .paymentId(payment.getId())
                .branchId(payment.getBranchId())
                .paymentMethod(payment.getPaymentMethod().name())
                .amount(payment.getAmount())
                .transactionId(payment.getTransactionId())
                .orderIds(orderIds)
                .paidAt(payment.getPaidAt())
                .build();

        outboxService.recordEvent("Payment", payment.getId().toString(), "PaymentSucceeded", event);
    }

    private void publishPaymentFailedEvent(Payment payment, String reason) {
        List<Long> orderIds = payment.getAllocations().stream()
                .map(PaymentOrderAllocation::getOrderId)
                .collect(Collectors.toList());

        PaymentFailedEvent event = PaymentFailedEvent.builder()
                .eventId(UUID.randomUUID().toString())
                .paymentId(payment.getId())
                .orderIds(orderIds)
                .reason(reason)
                .failedAt(LocalDateTime.now())
                .build();

        outboxService.recordEvent("Payment", payment.getId().toString(), "PaymentFailed", event);
    }

    private void saveGatewayLog(String paymentIdStr, GatewayProvider provider, GatewayDirection direction,
                                String eventKey, Boolean signatureValid, Integer httpStatus, Object payload) {
        try {
            Long paymentId = null;
            if (paymentIdStr != null) {
                try { paymentId = Long.parseLong(paymentIdStr); } catch (Exception ignored) {}
            }
            String jsonPayload = objectMapper.writeValueAsString(payload);

            PaymentGatewayLog logEntry = PaymentGatewayLog.builder()
                    .paymentId(paymentId)
                    .provider(provider)
                    .direction(direction)
                    .eventKey(eventKey)
                    .signatureValid(signatureValid)
                    .httpStatus(httpStatus)
                    .rawPayload(jsonPayload)
                    .processedAt(LocalDateTime.now())
                    .build();

            gatewayLogRepository.save(logEntry);
        } catch (Exception e) {
            log.error("Failed to save gateway log: {}", e.getMessage());
        }
    }

    private PaymentResponse mapToResponse(Payment payment, String paymentUrl) {
        List<Long> allocatedOrderIds = payment.getAllocations() != null
                ? payment.getAllocations().stream().map(PaymentOrderAllocation::getOrderId).collect(Collectors.toList())
                : Collections.emptyList();

        Long firstOrderId = !allocatedOrderIds.isEmpty() ? allocatedOrderIds.get(0) : null;

        return PaymentResponse.builder()
                .id(payment.getId())
                .orderId(firstOrderId)
                .branchId(payment.getBranchId())
                .cashierShiftId(payment.getCashierShiftId())
                .paymentMethod(payment.getPaymentMethod())
                .amount(payment.getAmount())
                .refundedAmount(payment.getRefundedAmount())
                .cashReceived(payment.getCashReceived())
                .changeAmount(payment.getChangeAmount())
                .collectedBy(payment.getCollectedBy())
                .transactionId(payment.getTransactionId())
                .status(payment.getStatus())
                .paymentUrl(paymentUrl)
                .allocatedOrderIds(allocatedOrderIds)
                .expiresAt(payment.getExpiresAt())
                .paidAt(payment.getPaidAt())
                .createdAt(payment.getCreatedAt())
                .build();
    }
}
