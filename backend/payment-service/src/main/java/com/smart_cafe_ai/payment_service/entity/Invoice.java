package com.smart_cafe_ai.payment_service.entity;

import com.smart_cafe_ai.payment_service.enums.InvoiceRelationType;
import com.smart_cafe_ai.payment_service.enums.InvoiceStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "Invoices", indexes = {
        @Index(name = "idx_invoices_status", columnList = "status, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invoice_number", length = 50, unique = true)
    private String invoiceNumber;

    @Column(name = "symbol", length = 20)
    private String symbol;

    @Column(name = "template_code", length = 20)
    private String templateCode;

    @Column(name = "buyer_name", nullable = false, length = 255)
    private String buyerName;

    @Column(name = "buyer_tax_code", length = 20)
    private String buyerTaxCode;

    @Column(name = "buyer_address", length = 255)
    private String buyerAddress;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "subtotal_amount", nullable = false, precision = 15, scale = 0)
    private BigDecimal subtotalAmount;

    @Column(name = "vat_rate", nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal vatRate = new BigDecimal("8.00");

    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 0)
    private BigDecimal vatAmount;

    @Column(name = "total_amount", nullable = false, precision = 15, scale = 0)
    private BigDecimal totalAmount;

    @Column(name = "lookup_code", length = 100)
    private String lookupCode;

    @Column(name = "pdf_url", length = 255)
    private String pdfUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private InvoiceStatus status = InvoiceStatus.Requested;

    @Column(name = "related_invoice_id")
    private Long relatedInvoiceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "relation_type", length = 20)
    private InvoiceRelationType relationType;

    @Column(name = "issued_at")
    private LocalDateTime issuedAt;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<InvoiceItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<InvoiceOrder> orders = new ArrayList<>();
}
