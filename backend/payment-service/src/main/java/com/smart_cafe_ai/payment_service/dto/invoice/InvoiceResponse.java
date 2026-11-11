package com.smart_cafe_ai.payment_service.dto.invoice;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smart_cafe_ai.payment_service.enums.InvoiceStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class InvoiceResponse {

    private Long id;
    private Long orderId;
    private String invoiceNumber;
    private String symbol;
    private String templateCode;
    private String buyerName;
    private String buyerTaxCode;
    private String buyerAddress;
    private String email;
    private BigDecimal subtotalAmount;
    private BigDecimal vatRate;
    private BigDecimal vatAmount;
    private BigDecimal totalAmount;
    private String lookupCode;
    private String pdfUrl;
    private InvoiceStatus status;
    private String createdBy;
    private LocalDateTime issuedAt;
    private LocalDateTime createdAt;
    private List<InvoiceItemResponse> items;
}
