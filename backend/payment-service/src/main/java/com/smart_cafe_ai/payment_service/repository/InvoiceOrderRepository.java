package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.InvoiceOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InvoiceOrderRepository extends JpaRepository<InvoiceOrder, Long> {

    List<InvoiceOrder> findByInvoiceId(Long invoiceId);

    Optional<InvoiceOrder> findByOrderIdAndIsActiveTrue(Long orderId);
}
