package com.smart_cafe_ai.payment_service.controller;

import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.PageMeta;
import com.smart_cafe_ai.payment_service.dto.invoice.CreateInvoiceRequest;
import com.smart_cafe_ai.payment_service.dto.invoice.InvoiceResponse;
import com.smart_cafe_ai.payment_service.enums.InvoiceStatus;
import com.smart_cafe_ai.payment_service.security.SecurityUtils;
import com.smart_cafe_ai.payment_service.service.InvoiceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping({"/invoices", "/api/v1/invoices"})
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoiceService;

    @PostMapping
    public ResponseEntity<ApiResponse<InvoiceResponse>> createInvoice(@Valid @RequestBody CreateInvoiceRequest request) {
        String currentUserId = SecurityUtils.getCurrentUserId();
        if (currentUserId == null) currentUserId = "GUEST_CUSTOMER";
        InvoiceResponse response = invoiceService.createInvoice(request, currentUserId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<List<InvoiceResponse>>> getMyInvoices(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        String currentUserId = SecurityUtils.getCurrentUserId();
        if (currentUserId == null) currentUserId = "GUEST_CUSTOMER";
        int pageIndex = Math.max(0, page - 1);
        Page<InvoiceResponse> pageResult = invoiceService.getMyInvoices(
                currentUserId,
                PageRequest.of(pageIndex, size, Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        PageMeta meta = PageMeta.builder()
                .page(page)
                .size(size)
                .totalItems(pageResult.getTotalElements())
                .totalPages(pageResult.getTotalPages())
                .build();

        return ResponseEntity.ok(ApiResponse.success(pageResult.getContent(), meta));
    }

    @GetMapping("/{id:\\d+}")
    public ResponseEntity<ApiResponse<InvoiceResponse>> getInvoiceById(@PathVariable("id") Long id) {
        InvoiceResponse response = invoiceService.getInvoiceById(id);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/{id:\\d+}/issue")
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<InvoiceResponse>> issueInvoice(@PathVariable("id") Long id) {
        String staffUserId = SecurityUtils.getCurrentUserId();
        InvoiceResponse response = invoiceService.issueInvoice(id, staffUserId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF', 'CASHIER', 'MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<InvoiceResponse>>> getInvoices(
            @RequestParam(value = "status", required = false) InvoiceStatus status,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        int pageIndex = Math.max(0, page - 1);
        Page<InvoiceResponse> pageResult = invoiceService.getInvoices(
                status,
                PageRequest.of(pageIndex, size, Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        PageMeta meta = PageMeta.builder()
                .page(page)
                .size(size)
                .totalItems(pageResult.getTotalElements())
                .totalPages(pageResult.getTotalPages())
                .build();

        return ResponseEntity.ok(ApiResponse.success(pageResult.getContent(), meta));
    }

    @GetMapping("/{id:\\d+}/pdf")
    public ResponseEntity<byte[]> downloadInvoicePdf(@PathVariable("id") Long id) {
        byte[] pdfBytes = invoiceService.generateInvoicePdf(id);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", "invoice_" + id + ".pdf");
        headers.setContentLength(pdfBytes.length);

        return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
    }
}
