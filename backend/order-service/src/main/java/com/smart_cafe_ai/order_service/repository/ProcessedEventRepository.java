package com.smart_cafe_ai.order_service.repository;
import com.smart_cafe_ai.order_service.model.ProcessedEvent;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent,String> {}
