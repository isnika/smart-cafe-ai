package com.smart_cafe_ai.identity_service.exception;

public class OtpLockedException extends RuntimeException {
    private final long retryAfterSeconds;

    public OtpLockedException(long retryAfterSeconds) {
        super("Bạn đã nhập sai OTP 5 lần. Vui lòng chờ " + retryAfterSeconds
                + " giây trước khi yêu cầu mã mới.");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
