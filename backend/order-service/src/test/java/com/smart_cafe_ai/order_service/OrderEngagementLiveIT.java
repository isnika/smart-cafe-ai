package com.smart_cafe_ai.order_service;

import com.smart_cafe_ai.order_service.integration.*;
import com.smart_cafe_ai.order_service.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Connectivity check only: real MySQL and real Engagement; missing voucher rolls back remote changes. */
@EnabledIfEnvironmentVariable(named="RUN_LIVE_ORDER_ENGAGEMENT",matches="true")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
        "spring.jpa.hibernate.ddl-auto=none","spring.jpa.show-sql=false","eureka.client.enabled=false",
        "spring.cloud.discovery.enabled=false","spring.rabbitmq.dynamic=false","app.order.expiry-enabled=false",
        "app.order-events.publisher-enabled=false","app.order-events.consumer-enabled=false",
        "app.identity-events.consumer-enabled=false","app.engagement.recovery-enabled=false"})
class OrderEngagementLiveIT {
    @Autowired EngagementClient engagement;
    @Autowired DataSource dataSource;
    @Test void realEngagementRejectsMissingVoucherThroughProductionHttpClient() throws Exception {
        String customer=System.getenv("LIVE_CUSTOMER_ID");
        assumeTrue(customer!=null&&!customer.isBlank(),"Cần LIVE_CUSTOMER_ID của tài khoản hiện có, không tự tạo user mẫu.");
        assertInstanceOf(HttpEngagementClient.class,engagement);
        try(var connection=dataSource.getConnection()) { assertTrue(connection.getMetaData().getURL().startsWith("jdbc:mysql:")); }
        String missingCode="MISSING-"+UUID.randomUUID();
        var rejected=assertThrows(ApiException.class,()->engagement.apply(missingCode,customer,Long.MAX_VALUE-1,1,"Pickup",new BigDecimal("50000")));
        assertEquals(422,rejected.status.value());
        assertEquals("BUSINESS_RULE_VIOLATION",rejected.code);
    }
}
