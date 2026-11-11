package com.smart_cafe_ai.order_service.repository;
import com.smart_cafe_ai.order_service.model.PaymentEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface PaymentEntryRepository extends JpaRepository<PaymentEntry,String> {List<PaymentEntry> findByOrderId(Long id);}
