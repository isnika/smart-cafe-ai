package com.smart_cafe_ai.identity_service.exception;

import org.springframework.http.HttpStatus;

public class GoogleAuthException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public GoogleAuthException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
