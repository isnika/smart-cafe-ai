package com.smart_cafe_ai.payment_service;

import com.smart_cafe_ai.payment_service.util.MomoUtil;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class MomoUtilTest {

    private static final String PARTNER_CODE = "MOMOBKUN20180529";
    private static final String ACCESS_KEY = "klm05TvNBzhg7h7j";
    private static final String SECRET_KEY = "at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa";

    @Test
    @DisplayName("Tạo signature cho Create Payment Request thành công")
    void testBuildCreatePaymentSignature() {
        long amount = 50000;
        String extraData = "";
        String ipnUrl = "http://localhost:8085/payments/momo/ipn";
        String orderId = "TEST_ORDER_123";
        String orderInfo = "Thanh toan test don hang";
        String redirectUrl = "http://localhost:3000/payment/momo-return";
        String requestId = "TEST_REQ_123";
        String requestType = "captureWallet";

        String signature = MomoUtil.buildCreatePaymentSignature(
                ACCESS_KEY,
                amount,
                extraData,
                ipnUrl,
                orderId,
                orderInfo,
                PARTNER_CODE,
                redirectUrl,
                requestId,
                requestType,
                SECRET_KEY
        );

        assertNotNull(signature);
        assertFalse(signature.isBlank());
        assertEquals(64, signature.length()); // SHA-256 hex string length is 64
    }

    @Test
    @DisplayName("Verify chữ ký IPN callback hợp lệ")
    void testValidateCallbackSignature_Valid() {
        Map<String, Object> params = new HashMap<>();
        params.put("partnerCode", PARTNER_CODE);
        params.put("orderId", "10025");
        params.put("requestId", "10025_REQ");
        params.put("amount", 54000L);
        params.put("orderInfo", "Thanh toan don hang #10025");
        params.put("orderType", "momo_wallet");
        params.put("transId", 9988776655L);
        params.put("resultCode", 0);
        params.put("message", "Thành công.");
        params.put("payType", "qr");
        params.put("responseTime", 1794028683316L);
        params.put("extraData", "");

        String raw = "accessKey=" + ACCESS_KEY +
                "&amount=54000" +
                "&extraData=" +
                "&message=Thành công." +
                "&orderId=10025" +
                "&orderInfo=Thanh toan don hang #10025" +
                "&orderType=momo_wallet" +
                "&partnerCode=" + PARTNER_CODE +
                "&payType=qr" +
                "&requestId=10025_REQ" +
                "&responseTime=1794028683316" +
                "&resultCode=0" +
                "&transId=9988776655";

        String expectedSignature = MomoUtil.hmacSHA256(SECRET_KEY, raw);
        params.put("signature", expectedSignature);

        boolean isValid = MomoUtil.validateCallbackSignature(params, ACCESS_KEY, SECRET_KEY);
        assertTrue(isValid, "Chữ ký hợp lệ phải trả về true");
    }

    @Test
    @DisplayName("Verify chữ ký thất bại khi bị giả mạo amount")
    void testValidateCallbackSignature_TamperedAmount() {
        Map<String, Object> params = new HashMap<>();
        params.put("partnerCode", PARTNER_CODE);
        params.put("orderId", "10025");
        params.put("requestId", "10025_REQ");
        params.put("amount", 54000L);
        params.put("orderInfo", "Thanh toan don hang #10025");
        params.put("orderType", "momo_wallet");
        params.put("transId", 9988776655L);
        params.put("resultCode", 0);
        params.put("message", "Thành công.");
        params.put("payType", "qr");
        params.put("responseTime", 1794028683316L);
        params.put("extraData", "");

        String raw = "accessKey=" + ACCESS_KEY +
                "&amount=54000" +
                "&extraData=" +
                "&message=Thành công." +
                "&orderId=10025" +
                "&orderInfo=Thanh toan don hang #10025" +
                "&orderType=momo_wallet" +
                "&partnerCode=" + PARTNER_CODE +
                "&payType=qr" +
                "&requestId=10025_REQ" +
                "&responseTime=1794028683316" +
                "&resultCode=0" +
                "&transId=9988776655";

        String signature = MomoUtil.hmacSHA256(SECRET_KEY, raw);
        params.put("signature", signature);

        // Kẻ tấn công sửa amount thành 1000
        params.put("amount", 1000L);

        boolean isValid = MomoUtil.validateCallbackSignature(params, ACCESS_KEY, SECRET_KEY);
        assertFalse(isValid, "Chữ ký không khớp với payload bị sửa đổi");
    }
}
