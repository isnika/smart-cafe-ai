package com.smart_cafe_ai.api_gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties={"eureka.client.enabled=false","spring.cloud.discovery.enabled=false",
        "spring.cloud.gateway.discovery.locator.enabled=false"})
class ApiGatewayApplicationTests {

	@Test
	void contextLoads() {
	}

}
