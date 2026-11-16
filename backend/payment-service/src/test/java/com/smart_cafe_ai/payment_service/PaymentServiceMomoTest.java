package com.smart_cafe_ai.payment_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.payment_service.client.OrderClient;
import com.smart_cafe_ai.payment_service.client.StoreClient;
import com.smart_cafe_ai.payment_service.dto.payment.PaymentResponse;
import com.smart_cafe_ai.payment_service.entity.Payment;
import com.smart_cafe_ai.payment_service.enums.PaymentMethod;
import com.smart_cafe_ai.payment_service.enums.PaymentStatus;
import com.smart_cafe_ai.payment_service.repository.CashierShiftRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentGatewayLogRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentOrderAllocationRepository;
import com.smart_cafe_ai.payment_service.repository.PaymentRepository;
import com.smart_cafe_ai.payment_service.service.OutboxService;
import com.smart_cafe_ai.payment_service.service.impl.PaymentServiceImpl;
import com.smart_cafe_ai.payment_service.util.MomoUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class PaymentServiceMomoTest {

    @Mock
    private PaymentRepository paymentRepository;
    @Mock
    private PaymentOrderAllocationRepository allocationRepository;
    @Mock
    private PaymentGatewayLogRepository gatewayLogRepository;
    @Mock
    private CashierShiftRepository cashierShiftRepository;
    @Mock
    private OutboxService outboxService;
    @Mock
    private OrderClient orderClient;
    @Mock
    private StoreClient storeClient;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private RestTemplate restTemplate;

    @InjectMocks
    private PaymentServiceImpl paymentService;

    private final String partnerCode = "MOMOBKUN20180529";
    private final String accessKey = "klm05TvNBzhg7h7j";
    private final String secretKey = "at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa";

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(paymentService, "momoPartnerCode", partnerCode);
        ReflectionTestUtils.setField(paymentService, "momoAccessKey", accessKey);
        ReflectionTestUtils.setField(paymentService, "momoSecretKey", secretKey);
        ReflectionTestUtils.setField(paymentService, "momoEndpoint", "https://test-payment.momo.vn/v2/gateway/api/create");
        ReflectionTestUtils.setField(paymentService, "momoReturnUrl", "http://localhost:3000/payment/momo-return");
        ReflectionTestUtils.setField(paymentService, "momoNotifyUrl", "http://localhost:8085/payments/momo/ipn");
    }

    @Test
    @DisplayName("processMomoIpn - Cập nhật thanh toán thành công khi signature hợp lệ và resultCode = 0")
    void testProcessMomoIpn_Success() {
        Payment mockPayment = Payment.builder()
                .id(1005L)
                .amount(new BigDecimal("50000"))
                .status(PaymentStatus.Pending)
                .paymentMethod(PaymentMethod.Momo)
                .allocations(new java.util.ArrayList<>())
                .build();

        when(paymentRepository.findById(1005L)).thenReturn(Optional.of(mockPayment));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Map<String, Object> payload = new HashMap<>();
        payload.put("partnerCode", partnerCode);
        payload.put("orderId", "1005");
        payload.put("requestId", "1005_REQ");
        payload.put("amount", 50000L);
        payload.put("orderInfo", "Thanh toan don hang #1005");
        payload.put("orderType", "momo_wallet");
        payload.put("transId", 99998888L);
        payload.put("resultCode", 0);
        payload.put("message", "Giao dịch thành công.");
        payload.put("payType", "qr");
        payload.put("responseTime", 1794028683316L);
        payload.put("extraData", "");

        String raw = "accessKey=" + accessKey +
                "&amount=50000" +
                "&extraData=" +
                "&message=Giao dịch thành công." +
                "&orderId=1005" +
                "&orderInfo=Thanh toan don hang #1005" +
                "&orderType=momo_wallet" +
                "&partnerCode=" + partnerCode +
                "&payType=qr" +
                "&requestId=1005_REQ" +
                "&responseTime=1794028683316" +
                "&resultCode=0" +
                "&transId=99998888";

        String signature = MomoUtil.hmacSHA256(secretKey, raw);
        payload.put("signature", signature);

        Map<String, Object> ipnResult = paymentService.processMomoIpn(payload);

        assertEquals(0, ipnResult.get("resultCode"));
        assertEquals("Success", ipnResult.get("message"));
        assertEquals(PaymentStatus.Success, mockPayment.getStatus());
        assertEquals("99998888", mockPayment.getTransactionId());
        verify(outboxService, times(1)).recordEvent(eq("Payment"), eq("1005"), eq("PaymentSucceeded"), any());
    }

    @Test
    @DisplayName("processMomoIpn - Từ chối khi chữ ký sai")
    void testProcessMomoIpn_InvalidSignature() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("partnerCode", partnerCode);
        payload.put("orderId", "1005");
        payload.put("requestId", "1005_REQ");
        payload.put("amount", 50000L);
        payload.put("signature", "invalid_signature");

        Map<String, Object> ipnResult = paymentService.processMomoIpn(payload);

        assertEquals(97, ipnResult.get("resultCode"));
        assertEquals("Invalid Checksum", ipnResult.get("message"));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("processMomoReturn - Xử lý redirect return của MoMo thành công")
    void testProcessMomoReturn_Success() {
        Payment mockPayment = Payment.builder()
                .id(1006L)
                .amount(new BigDecimal("60000"))
                .status(PaymentStatus.Pending)
                .paymentMethod(PaymentMethod.Momo)
                .allocations(new java.util.ArrayList<>())
                .build();

        when(paymentRepository.findById(1006L)).thenReturn(Optional.of(mockPayment));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Map<String, String> params = new HashMap<>();
        params.put("partnerCode", partnerCode);
        params.put("orderId", "1006");
        params.put("requestId", "1006_REQ");
        params.put("amount", "60000");
        params.put("orderInfo", "Thanh toan don hang #1006");
        params.put("orderType", "momo_wallet");
        params.put("transId", "12345678");
        params.put("resultCode", "0");
        params.put("message", "Thanh cong");
        params.put("payType", "qr");
        params.put("responseTime", "1794028683316");
        params.put("extraData", "");

        String raw = "accessKey=" + accessKey +
                "&amount=60000" +
                "&extraData=" +
                "&message=Thanh cong" +
                "&orderId=1006" +
                "&orderInfo=Thanh toan don hang #1006" +
                "&orderType=momo_wallet" +
                "&partnerCode=" + partnerCode +
                "&payType=qr" +
                "&requestId=1006_REQ" +
                "&responseTime=1794028683316" +
                "&resultCode=0" +
                "&transId=12345678";

        String signature = MomoUtil.hmacSHA256(secretKey, raw);
        params.put("signature", signature);

        PaymentResponse response = paymentService.processMomoReturn(params);

        assertNotNull(response);
        assertEquals(PaymentStatus.Success, response.getStatus());
        assertEquals("12345678", response.getTransactionId());
        verify(outboxService, times(1)).recordEvent(eq("Payment"), eq("1006"), eq("PaymentSucceeded"), any());
    }
}
