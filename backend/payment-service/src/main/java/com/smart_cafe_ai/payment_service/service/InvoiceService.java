package com.smart_cafe_ai.payment_service.service;

import com.smart_cafe_ai.payment_service.dto.invoice.CreateInvoiceRequest;
import com.smart_cafe_ai.payment_service.dto.invoice.InvoiceResponse;
import com.smart_cafe_ai.payment_service.enums.InvoiceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface InvoiceService {

    InvoiceResponse createInvoice(CreateInvoiceRequest request, String currentUserId);

    InvoiceResponse issueInvoice(Long id, String staffUserId);

    InvoiceResponse getInvoiceById(Long id);

    Page<InvoiceResponse> getMyInvoices(String userId, Pageable pageable);

    Page<InvoiceResponse> getInvoices(InvoiceStatus status, Pageable pageable);

    byte[] generateInvoicePdf(Long id);
}
