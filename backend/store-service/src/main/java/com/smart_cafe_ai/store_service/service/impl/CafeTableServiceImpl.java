package com.smart_cafe_ai.store_service.service.impl;

import com.smart_cafe_ai.store_service.dto.table.CafeTableRequest;
import com.smart_cafe_ai.store_service.dto.table.CafeTableResponse;
import com.smart_cafe_ai.store_service.entity.Branch;
import com.smart_cafe_ai.store_service.entity.CafeTable;
import com.smart_cafe_ai.store_service.enums.TableSessionStatus;
import com.smart_cafe_ai.store_service.exception.BusinessException;
import com.smart_cafe_ai.store_service.exception.ResourceNotFoundException;
import com.smart_cafe_ai.store_service.repository.BranchRepository;
import com.smart_cafe_ai.store_service.repository.CafeTableRepository;
import com.smart_cafe_ai.store_service.repository.TableSessionRepository;
import com.smart_cafe_ai.store_service.service.CafeTableService;
import com.smart_cafe_ai.store_service.service.QrCodeService;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CafeTableServiceImpl implements CafeTableService {

    private final CafeTableRepository cafeTableRepository;
    private final BranchRepository branchRepository;
    private final TableSessionRepository tableSessionRepository;
    private final QrCodeService qrCodeService;

    @Override
    @Transactional(readOnly = true)
    public List<CafeTableResponse> getTablesByBranch(Integer branchId, Boolean isActive) {
        if (!branchRepository.existsById(branchId)) {
            throw new ResourceNotFoundException("Chi nhánh", branchId);
        }

        List<CafeTable> tables;
        if (isActive != null) {
            tables = cafeTableRepository.findAllByBranchIdAndIsActive(branchId, isActive);
        } else {
            tables = cafeTableRepository.findAllByBranchId(branchId);
        }

        return tables.stream()
                .map(CafeTableResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public CafeTableResponse getTableById(Integer id) {
        CafeTable table = cafeTableRepository.findByIdWithBranch(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bàn", id));
        return CafeTableResponse.fromEntity(table);
    }

    @Override
    @Transactional
    public CafeTableResponse createTable(Integer branchId, CafeTableRequest request) {
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", branchId));

        if (cafeTableRepository.existsByBranchIdAndTableNumber(branchId, request.getTableNumber())) {
            throw new BusinessException("TABLE_NUMBER_EXISTS", "Số bàn '" + request.getTableNumber() + "' đã tồn tại ở chi nhánh này");
        }

        String qrCode = generateUniqueQrCode();

        CafeTable table = CafeTable.builder()
                .branch(branch)
                .tableNumber(request.getTableNumber())
                .qrCode(qrCode)
                .isActive(true)
                .build();

        CafeTable saved = cafeTableRepository.save(table);
        return CafeTableResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public CafeTableResponse updateTable(Integer id, CafeTableRequest request) {
        CafeTable table = cafeTableRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bàn", id));

        if (!table.getTableNumber().equalsIgnoreCase(request.getTableNumber()) &&
                cafeTableRepository.existsByBranchIdAndTableNumber(table.getBranch().getId(), request.getTableNumber())) {
            throw new BusinessException("TABLE_NUMBER_EXISTS", "Số bàn '" + request.getTableNumber() + "' đã tồn tại ở chi nhánh này");
        }

        table.setTableNumber(request.getTableNumber());
        CafeTable saved = cafeTableRepository.save(table);
        return CafeTableResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public CafeTableResponse updateTableActive(Integer id, Boolean isActive) {
        CafeTable table = cafeTableRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bàn", id));

        // Ràng buộc: Không cho tắt bàn nếu đang có phiên Active hoặc Payment_Pending
        if (Boolean.FALSE.equals(isActive)) {
            boolean hasActiveSession = tableSessionRepository.existsByTableIdAndStatusIn(
                    id, List.of(TableSessionStatus.Active, TableSessionStatus.Payment_Pending)
            );
            if (hasActiveSession) {
                throw new BusinessException("TABLE_HAS_ACTIVE_SESSION", "Không thể vô hiệu hóa bàn đang có phiên hoạt động");
            }
        }

        table.setIsActive(isActive);
        CafeTable saved = cafeTableRepository.save(table);
        return CafeTableResponse.fromEntity(saved);
    }

    @Override
    @Transactional
    public CafeTableResponse regenerateQrCode(Integer id) {
        CafeTable table = cafeTableRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bàn", id));

        table.setQrCode(generateUniqueQrCode());
        CafeTable saved = cafeTableRepository.save(table);
        return CafeTableResponse.fromEntity(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] getTableQrImage(Integer id, String format) {
        CafeTable table = cafeTableRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bàn", id));

        try {
            return qrCodeService.generateQrCode(table.getQrCode(), 350, 350);
        } catch (Exception e) {
            throw new BusinessException("QR_GENERATION_FAILED", "Không thể tạo ảnh QR cho bàn: " + e.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] exportBranchTablesQrPdf(Integer branchId) {
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResourceNotFoundException("Chi nhánh", branchId));

        List<CafeTable> tables = cafeTableRepository.findAllByBranchIdAndIsActive(branchId, true);
        if (tables.isEmpty()) {
            throw new BusinessException("NO_ACTIVE_TABLES", "Chi nhánh không có bàn nào đang hoạt động để xuất QR");
        }

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 36, 36);
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18, Color.DARK_GRAY);
            Paragraph title = new Paragraph("Smart Cafe - Danh sach ma QR Ban: " + branch.getName(), titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(20);
            document.add(title);

            PdfPTable tableGrid = new PdfPTable(2);
            tableGrid.setWidthPercentage(100);

            for (CafeTable t : tables) {
                PdfPCell cell = new PdfPCell();
                cell.setPadding(12);
                cell.setHorizontalAlignment(Element.ALIGN_CENTER);

                Paragraph tableTitle = new Paragraph("Ban: " + t.getTableNumber(), FontFactory.getFont(FontFactory.HELVETICA_BOLD, 14, Color.BLACK));
                tableTitle.setAlignment(Element.ALIGN_CENTER);
                cell.addElement(tableTitle);

                byte[] qrImgBytes = qrCodeService.generateQrCode(t.getQrCode(), 180, 180);
                Image qrImage = Image.getInstance(qrImgBytes);
                qrImage.setAlignment(Element.ALIGN_CENTER);
                cell.addElement(qrImage);

                Paragraph codeText = new Paragraph("Ma: " + t.getQrCode(), FontFactory.getFont(FontFactory.HELVETICA, 10, Color.GRAY));
                codeText.setAlignment(Element.ALIGN_CENTER);
                cell.addElement(codeText);

                tableGrid.addCell(cell);
            }

            if (tables.size() % 2 != 0) {
                PdfPCell emptyCell = new PdfPCell();
                emptyCell.setBorder(Rectangle.NO_BORDER);
                tableGrid.addCell(emptyCell);
            }

            document.add(tableGrid);
            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new BusinessException("PDF_EXPORT_FAILED", "Không thể xuất file PDF mã QR: " + e.getMessage());
        }
    }

    private String generateUniqueQrCode() {
        return "QR-" + UUID.randomUUID().toString().toUpperCase().replace("-", "").substring(0, 16);
    }
}
