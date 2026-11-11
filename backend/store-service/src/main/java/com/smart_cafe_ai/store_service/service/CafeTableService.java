package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.table.CafeTableRequest;
import com.smart_cafe_ai.store_service.dto.table.CafeTableResponse;

import java.util.List;

public interface CafeTableService {

    List<CafeTableResponse> getTablesByBranch(Integer branchId, Boolean isActive);

    CafeTableResponse getTableById(Integer id);

    CafeTableResponse createTable(Integer branchId, CafeTableRequest request);

    CafeTableResponse updateTable(Integer id, CafeTableRequest request);

    CafeTableResponse updateTableActive(Integer id, Boolean isActive);

    CafeTableResponse regenerateQrCode(Integer id);

    byte[] getTableQrImage(Integer id, String format);

    byte[] exportBranchTablesQrPdf(Integer branchId);
}
