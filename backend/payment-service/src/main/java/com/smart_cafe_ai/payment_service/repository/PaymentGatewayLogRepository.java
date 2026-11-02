package com.smart_cafe_ai.payment_service.repository;

import com.smart_cafe_ai.payment_service.entity.PaymentGatewayLog;
import com.smart_cafe_ai.payment_service.enums.GatewayDirection;
import com.smart_cafe_ai.payment_service.enums.GatewayProvider;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PaymentGatewayLogRepository extends JpaRepository<PaymentGatewayLog, Long> {

    Optional<PaymentGatewayLog> findByProviderAndDirectionAndEventKey(
            GatewayProvider provider,
            GatewayDirection direction,
            String eventKey
    );

    boolean existsByProviderAndDirectionAndEventKey(
            GatewayProvider provider,
            GatewayDirection direction,
            String eventKey
    );
}
