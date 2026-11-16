package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.InvoiceItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface InvoiceItemRepository extends JpaRepository<InvoiceItem, Long> {

    List<InvoiceItem> findByInvoiceIdOrderByLineNoAsc(Long invoiceId);
}
