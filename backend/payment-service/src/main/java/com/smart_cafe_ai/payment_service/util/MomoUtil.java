package com.smart_cafe_ai.payment_service.util;

import lombok.extern.slf4j.Slf4j;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Slf4j
public class MomoUtil {

    public static String hmacSHA256(String key, String data) {
        try {
            if (key == null || data == null) {
                return null;
            }
            Mac hmac256 = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmac256.init(secretKey);
            byte[] result = hmac256.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(2 * result.length);
            for (byte b : result) {
                sb.append(String.format("%02x", b & 0xff));
            }
            return sb.toString();
        } catch (Exception ex) {
            log.error("Error generating HMAC-SHA256: {}", ex.getMessage());
            return "";
        }
    }

    public static String buildCreatePaymentSignature(
            String accessKey,
            long amount,
            String extraData,
            String ipnUrl,
            String orderId,
            String orderInfo,
            String partnerCode,
            String redirectUrl,
            String requestId,
            String requestType,
            String secretKey
    ) {
        String raw = "accessKey=" + accessKey +
                "&amount=" + amount +
                "&extraData=" + (extraData != null ? extraData : "") +
                "&ipnUrl=" + ipnUrl +
                "&orderId=" + orderId +
                "&orderInfo=" + orderInfo +
                "&partnerCode=" + partnerCode +
                "&redirectUrl=" + redirectUrl +
                "&requestId=" + requestId +
                "&requestType=" + requestType;
        return hmacSHA256(secretKey, raw);
    }

    public static boolean validateCallbackSignature(Map<String, ?> params, String accessKey, String secretKey) {
        if (params == null || secretKey == null || accessKey == null) {
            return false;
        }

        Object sigObj = params.get("signature");
        if (sigObj == null) {
            return false;
        }
        String receivedSignature = String.valueOf(sigObj);
        if (receivedSignature.isBlank()) {
            return false;
        }

        String raw = "accessKey=" + accessKey +
                "&amount=" + getParamValue(params, "amount") +
                "&extraData=" + getParamValue(params, "extraData") +
                "&message=" + getParamValue(params, "message") +
                "&orderId=" + getParamValue(params, "orderId") +
                "&orderInfo=" + getParamValue(params, "orderInfo") +
                "&orderType=" + getParamValue(params, "orderType") +
                "&partnerCode=" + getParamValue(params, "partnerCode") +
                "&payType=" + getParamValue(params, "payType") +
                "&requestId=" + getParamValue(params, "requestId") +
                "&responseTime=" + getParamValue(params, "responseTime") +
                "&resultCode=" + getParamValue(params, "resultCode") +
                "&transId=" + getParamValue(params, "transId");

        String calculated = hmacSHA256(secretKey, raw);
        return calculated != null && calculated.equalsIgnoreCase(receivedSignature);
    }

    private static String getParamValue(Map<String, ?> params, String key) {
        Object val = params.get(key);
        return val != null ? String.valueOf(val) : "";
    }
}
