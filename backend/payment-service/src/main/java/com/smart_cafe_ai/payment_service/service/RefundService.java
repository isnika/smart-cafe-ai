package com.smart_cafe_ai.payment_service.service;

import com.smart_cafe_ai.payment_service.dto.refund.CreateRefundRequest;
import com.smart_cafe_ai.payment_service.dto.refund.ProcessRefundRequest;
import com.smart_cafe_ai.payment_service.dto.refund.RefundResponse;
import com.smart_cafe_ai.payment_service.enums.RefundStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RefundService {

    RefundResponse createRefund(CreateRefundRequest request, String requestedBy);

    RefundResponse processRefund(Long id, ProcessRefundRequest request, String staffUserId);

    RefundResponse getRefundById(Long id);

    Page<RefundResponse> getRefunds(RefundStatus status, Pageable pageable);

    Page<RefundResponse> getMyRefunds(String requestedBy, Pageable pageable);
}
