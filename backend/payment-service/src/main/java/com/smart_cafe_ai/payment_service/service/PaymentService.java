package com.smart_cafe_ai.payment_service.service;

import com.smart_cafe_ai.payment_service.dto.payment.ConfirmCashRequest;
import com.smart_cafe_ai.payment_service.dto.payment.CreatePaymentRequest;
import com.smart_cafe_ai.payment_service.dto.payment.PaymentResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;

public interface PaymentService {

    PaymentResponse createPayment(CreatePaymentRequest request, String currentUserId, String clientIp);

    PaymentResponse confirmCash(Long paymentId, ConfirmCashRequest request, String cashierUserId);

    PaymentResponse getPaymentById(Long id);

    Page<PaymentResponse> getMyPayments(String userId, Pageable pageable);

    Page<PaymentResponse> getPayments(Integer branchId, Pageable pageable);

    Map<String, String> processVnPayIpn(Map<String, String> params);

    Map<String, Object> processMomoIpn(Map<String, Object> payload);

    PaymentResponse processVnPayReturn(Map<String, String> params);
}
