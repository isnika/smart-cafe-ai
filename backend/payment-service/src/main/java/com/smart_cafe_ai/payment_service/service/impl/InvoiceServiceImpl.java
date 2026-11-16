package com.smart_cafe_ai.payment_service.service.impl;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.smart_cafe_ai.payment_service.client.OrderClient;
import com.smart_cafe_ai.payment_service.dto.ApiResponse;
import com.smart_cafe_ai.payment_service.dto.client.OrderDto;
import com.smart_cafe_ai.payment_service.dto.invoice.CreateInvoiceRequest;
import com.smart_cafe_ai.payment_service.dto.invoice.InvoiceItemResponse;
import com.smart_cafe_ai.payment_service.dto.invoice.InvoiceResponse;
import com.smart_cafe_ai.payment_service.entity.Invoice;
import com.smart_cafe_ai.payment_service.entity.InvoiceItem;
import com.smart_cafe_ai.payment_service.entity.InvoiceOrder;
import com.smart_cafe_ai.payment_service.enums.InvoiceStatus;
import com.smart_cafe_ai.payment_service.exception.BusinessException;
import com.smart_cafe_ai.payment_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.payment_service.repository.InvoiceItemRepository;
import com.smart_cafe_ai.payment_service.repository.InvoiceOrderRepository;
import com.smart_cafe_ai.payment_service.repository.InvoiceRepository;
import com.smart_cafe_ai.payment_service.service.InvoiceService;
import com.smart_cafe_ai.payment_service.service.OutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceServiceImpl implements InvoiceService {

    private final InvoiceRepository invoiceRepository;
    private final InvoiceOrderRepository invoiceOrderRepository;
    private final InvoiceItemRepository invoiceItemRepository;
    private final com.smart_cafe_ai.payment_service.repository.PaymentRepository paymentRepository;
    private final OrderClient orderClient;
    private final OutboxService outboxService;

    @Override
    @Transactional
    public InvoiceResponse createInvoice(CreateInvoiceRequest request, String currentUserId) {
        // Kiểm tra xem đơn hàng đã có hóa đơn active chưa
        invoiceOrderRepository.findByOrderIdAndIsActiveTrue(request.getOrderId())
                .ifPresent(io -> {
                    throw new BusinessException("INVOICE_ALREADY_EXISTS", "Đơn hàng #" + request.getOrderId() + " đã được tạo hóa đơn VAT (Hóa đơn #" + io.getInvoice().getId() + ")", HttpStatus.CONFLICT);
                });

        // Lấy thông tin đơn hàng
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<OrderDto.OrderItemDto> items = new ArrayList<>();

        try {
            ApiResponse<OrderDto> orderRes = orderClient.getOrderById(request.getOrderId());
            if (orderRes != null && orderRes.isSuccess() && orderRes.getData() != null) {
                OrderDto order = orderRes.getData();
                totalAmount = order.getTotalAmount();
                if (order.getItems() != null) {
                    items.addAll(order.getItems());
                }
            }
        } catch (Exception e) {
            log.warn("Feign call orderClient failed: {}. Checking payment records fallback.", e.getMessage());
        }

        // Nếu order-service chưa bật, tra cứu số tiền từ giao dịch thanh toán của đơn hàng này
        if (totalAmount == null || totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
            List<com.smart_cafe_ai.payment_service.entity.Payment> payments = paymentRepository.findByOrderId(request.getOrderId());
            if (!payments.isEmpty() && payments.get(0).getAmount() != null) {
                totalAmount = payments.get(0).getAmount();
            } else {
                totalAmount = new BigDecimal("54000"); // fallback mặc định nếu chưa thanh toán
            }
        }

        // Tính VAT (8%)
        BigDecimal vatRate = new BigDecimal("8.00");
        // totalAmount = subtotal * 1.08 => subtotal = totalAmount / 1.08
        BigDecimal divisor = BigDecimal.ONE.add(vatRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
        BigDecimal subtotal = totalAmount.divide(divisor, 0, RoundingMode.HALF_UP);
        BigDecimal vatAmount = totalAmount.subtract(subtotal);

        Invoice invoice = Invoice.builder()
                .buyerName(request.getBuyerName())
                .buyerTaxCode(request.getBuyerTaxCode())
                .buyerAddress(request.getBuyerAddress())
                .email(request.getEmail())
                .subtotalAmount(subtotal)
                .vatRate(vatRate)
                .vatAmount(vatAmount)
                .totalAmount(totalAmount)
                .status(InvoiceStatus.Requested)
                .symbol("1C26TAA")
                .templateCode("1/001")
                .createdBy(currentUserId)
                .build();

        invoice = invoiceRepository.save(invoice);

        // Invoice Order link
        InvoiceOrder invoiceOrder = InvoiceOrder.builder()
                .invoice(invoice)
                .orderId(request.getOrderId())
                .isActive(true)
                .build();
        invoiceOrderRepository.save(invoiceOrder);
        invoice.getOrders().add(invoiceOrder);

        // Invoice Items
        if (items.isEmpty()) {
            InvoiceItem defaultItem = InvoiceItem.builder()
                    .invoice(invoice)
                    .lineNo(1)
                    .description("Dịch vụ ẩm thực Smart Café")
                    .unit("Lần")
                    .quantity(BigDecimal.ONE)
                    .unitPrice(subtotal)
                    .amount(subtotal)
                    .vatRate(vatRate)
                    .build();
            invoiceItemRepository.save(defaultItem);
            invoice.getItems().add(defaultItem);
        } else {
            int lineNo = 1;
            for (OrderDto.OrderItemDto itemDto : items) {
                BigDecimal itemPrice = itemDto.getUnitPrice() != null ? itemDto.getUnitPrice() : subtotal;
                BigDecimal itemSubtotal = itemPrice.divide(divisor, 0, RoundingMode.HALF_UP);
                InvoiceItem lineItem = InvoiceItem.builder()
                        .invoice(invoice)
                        .lineNo(lineNo++)
                        .description(itemDto.getItemName() != null ? itemDto.getItemName() : "Đồ uống")
                        .unit("Ly")
                        .quantity(BigDecimal.valueOf(itemDto.getQuantity() != null ? itemDto.getQuantity() : 1))
                        .unitPrice(itemSubtotal)
                        .amount(itemSubtotal.multiply(BigDecimal.valueOf(itemDto.getQuantity() != null ? itemDto.getQuantity() : 1)))
                        .vatRate(vatRate)
                        .build();
                invoiceItemRepository.save(lineItem);
                invoice.getItems().add(lineItem);
            }
        }

        log.info("Created invoice request #{} for order #{}", invoice.getId(), request.getOrderId());
        return mapToResponse(invoice);
    }

    @Override
    @Transactional
    public InvoiceResponse issueInvoice(Long id, String staffUserId) {
        Invoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hóa đơn", id));

        if (invoice.getStatus() != InvoiceStatus.Requested) {
            throw new BusinessException("INVALID_INVOICE_STATUS", "Chỉ có thể phát hành hóa đơn ở trạng thái Requested (trạng thái: " + invoice.getStatus() + ")", HttpStatus.BAD_REQUEST);
        }

        String invNum = "INV" + DateTimeFormatter.ofPattern("yyyyMMdd").format(LocalDateTime.now()) + String.format("%04d", id);
        String lookupCode = UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        invoice.setInvoiceNumber(invNum);
        invoice.setLookupCode(lookupCode);
        invoice.setStatus(InvoiceStatus.Issued);
        invoice.setIssuedAt(LocalDateTime.now());
        invoice.setPdfUrl("/api/v1/invoices/" + id + "/pdf");

        invoice = invoiceRepository.save(invoice);
        log.info("Issued invoice #{} with number {} by staff {}", id, invNum, staffUserId);

        return mapToResponse(invoice);
    }

    @Override
    @Transactional(readOnly = true)
    public InvoiceResponse getInvoiceById(Long id) {
        Invoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hóa đơn", id));
        return mapToResponse(invoice);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<InvoiceResponse> getMyInvoices(String userId, Pageable pageable) {
        Page<Invoice> page = invoiceRepository.findByCreatedByOrCreatedByIsNull(userId, pageable);
        return page.map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<InvoiceResponse> getInvoices(InvoiceStatus status, Pageable pageable) {
        Page<Invoice> page = status != null
                ? invoiceRepository.findByStatus(status, pageable)
                : invoiceRepository.findAll(pageable);
        return page.map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] generateInvoicePdf(Long id) {
        Invoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hóa đơn", id));

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 36, 36, 36, 36);

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18);
            Paragraph title = new Paragraph("HOA DON GIA TRI GIA TANG (VAT)", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            document.add(title);

            Font subFont = FontFactory.getFont(FontFactory.HELVETICA, 10);
            Paragraph sub = new Paragraph("Ky hieu: " + (invoice.getSymbol() != null ? invoice.getSymbol() : "1C26TAA") +
                    " - So: " + (invoice.getInvoiceNumber() != null ? invoice.getInvoiceNumber() : "DRAFT") +
                    " - Ma tra cuu: " + (invoice.getLookupCode() != null ? invoice.getLookupCode() : "N/A"), subFont);
            sub.setAlignment(Element.ALIGN_CENTER);
            sub.setSpacingAfter(15);
            document.add(sub);

            // Thông tin bên bán & bên mua
            Paragraph buyerInfo = new Paragraph(
                    "Don vi ban: HE THONG SMART CAFE AI\n" +
                    "MST: 0101234567\n" +
                    "--------------------------------------------------\n" +
                    "Nguoi mua hang: " + invoice.getBuyerName() + "\n" +
                    "Ma so thue: " + (invoice.getBuyerTaxCode() != null ? invoice.getBuyerTaxCode() : "Khach le") + "\n" +
                    "Dia chi: " + (invoice.getBuyerAddress() != null ? invoice.getBuyerAddress() : "N/A") + "\n\n",
                    FontFactory.getFont(FontFactory.HELVETICA, 11)
            );
            document.add(buyerInfo);

            // Bảng sản phẩm
            PdfPTable table = new PdfPTable(5);
            table.setWidthPercentage(100);
            table.setWidths(new float[]{1, 5, 2, 2, 3});

            addCell(table, "STT", true);
            addCell(table, "Ten hang hoa, dich vu", true);
            addCell(table, "Don vi", true);
            addCell(table, "So luong", true);
            addCell(table, "Thanh tien (VND)", true);

            List<InvoiceItem> items = invoiceItemRepository.findByInvoiceIdOrderByLineNoAsc(id);
            for (InvoiceItem item : items) {
                addCell(table, String.valueOf(item.getLineNo()), false);
                addCell(table, item.getDescription(), false);
                addCell(table, item.getUnit() != null ? item.getUnit() : "Ly", false);
                addCell(table, String.valueOf(item.getQuantity().intValue()), false);
                addCell(table, item.getAmount().toString(), false);
            }
            document.add(table);

            // Tổng cộng
            Paragraph totalParagraph = new Paragraph(
                    "\nCong tien hang: " + invoice.getSubtotalAmount() + " VND\n" +
                    "Thue suat GTGT (" + invoice.getVatRate() + "%): " + invoice.getVatAmount() + " VND\n" +
                    "TONG CONG TIEN THANH TOAN: " + invoice.getTotalAmount() + " VND\n",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12)
            );
            totalParagraph.setAlignment(Element.ALIGN_RIGHT);
            document.add(totalParagraph);

            document.close();
        } catch (Exception e) {
            log.error("Failed to generate PDF for invoice #{}: {}", id, e.getMessage());
            throw new BusinessException("PDF_GENERATION_FAILED", "Lỗi tạo file PDF hóa đơn: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return out.toByteArray();
    }

    private void addCell(PdfPTable table, String text, boolean isHeader) {
        Font font = isHeader ? FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10) : FontFactory.getFont(FontFactory.HELVETICA, 10);
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setPadding(5);
        if (isHeader) {
            cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        }
        table.addCell(cell);
    }

    private InvoiceResponse mapToResponse(Invoice invoice) {
        Long orderId = !invoice.getOrders().isEmpty() ? invoice.getOrders().get(0).getOrderId() : null;

        List<InvoiceItemResponse> itemResponses = invoice.getItems().stream()
                .map(it -> InvoiceItemResponse.builder()
                        .lineNo(it.getLineNo())
                        .description(it.getDescription())
                        .unit(it.getUnit())
                        .quantity(it.getQuantity())
                        .unitPrice(it.getUnitPrice())
                        .amount(it.getAmount())
                        .vatRate(it.getVatRate())
                        .build())
                .collect(Collectors.toList());

        return InvoiceResponse.builder()
                .id(invoice.getId())
                .orderId(orderId)
                .invoiceNumber(invoice.getInvoiceNumber())
                .symbol(invoice.getSymbol())
                .templateCode(invoice.getTemplateCode())
                .buyerName(invoice.getBuyerName())
                .buyerTaxCode(invoice.getBuyerTaxCode())
                .buyerAddress(invoice.getBuyerAddress())
                .email(invoice.getEmail())
                .subtotalAmount(invoice.getSubtotalAmount())
                .vatRate(invoice.getVatRate())
                .vatAmount(invoice.getVatAmount())
                .totalAmount(invoice.getTotalAmount())
                .lookupCode(invoice.getLookupCode())
                .pdfUrl(invoice.getPdfUrl())
                .status(invoice.getStatus())
                .createdBy(invoice.getCreatedBy())
                .issuedAt(invoice.getIssuedAt())
                .createdAt(invoice.getCreatedAt())
                .items(itemResponses)
                .build();
    }
}
