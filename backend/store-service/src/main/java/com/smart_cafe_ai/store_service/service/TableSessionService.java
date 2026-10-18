package com.smart_cafe_ai.store_service.service;

import com.smart_cafe_ai.store_service.dto.session.TableSessionResponse;
import com.smart_cafe_ai.store_service.dto.table.CafeTableResponse;
import com.smart_cafe_ai.store_service.enums.TableSessionStatus;

import java.util.List;

public interface TableSessionService {

    CafeTableResponse getTableByQrCode(String qrCode);

    TableSessionResponse getOrCreateSessionByQrCode(String qrCode, String customerId);

    TableSessionResponse getCurrentSessionByCode(String sessionCode);

    TableSessionResponse requestPayment(String sessionCode);

    List<TableSessionResponse> getSessionsByBranch(Integer branchId, List<TableSessionStatus> statuses);

    TableSessionResponse updateSessionStatus(Long id, TableSessionStatus status);

    TableSessionResponse getSessionByIdInternal(Long id);
}
