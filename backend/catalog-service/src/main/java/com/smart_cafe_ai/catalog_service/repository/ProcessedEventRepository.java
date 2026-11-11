package com.smart_cafe_ai.catalog_service.repository;
import com.smart_cafe_ai.catalog_service.model.ProcessedEvent;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent,String> {}
