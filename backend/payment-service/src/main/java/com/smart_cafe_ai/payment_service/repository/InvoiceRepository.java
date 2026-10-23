package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.Invoice;
import com.smart_cafe_ai.payment_service.enums.InvoiceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    Optional<Invoice> findByInvoiceNumber(String invoiceNumber);

    Optional<Invoice> findByLookupCode(String lookupCode);

    Page<Invoice> findByStatus(InvoiceStatus status, Pageable pageable);

    Page<Invoice> findByCreatedBy(String createdBy, Pageable pageable);

    @org.springframework.data.jpa.repository.Query("SELECT i FROM Invoice i WHERE i.createdBy = :createdBy OR i.createdBy IS NULL")
    Page<Invoice> findByCreatedByOrCreatedByIsNull(@org.springframework.data.repository.query.Param("createdBy") String createdBy, Pageable pageable);
}
