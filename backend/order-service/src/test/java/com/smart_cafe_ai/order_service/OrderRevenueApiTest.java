package com.smart_cafe_ai.order_service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.order_service.integration.EngagementClient;
import com.smart_cafe_ai.order_service.integration.OrderDependencies;
import com.smart_cafe_ai.order_service.model.CafeOrder;
import com.smart_cafe_ai.order_service.model.Types;
import com.smart_cafe_ai.order_service.repository.OrderRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OrderRevenueApiTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderRepository orders;
    @MockBean OrderDependencies dependencies;
    @MockBean EngagementClient engagement;

    final String admin = token("admin-1", "ROLE_ADMIN", null);
    final String managerBranch1 = token("manager-1", "ROLE_MANAGER", 1);
    final String customer = token("customer-1", "ROLE_CUSTOMER", null);

    static String token(String user, String role, Integer branchId) {
        var builder = Jwts.builder()
                .subject(user)
                .claim("role", role)
                .issuedAt(new Date())
                .expiration(Date.from(Instant.now().plusSeconds(3600)));
        if (branchId != null) {
            builder.claim("branch_id", branchId);
        }
        return "Bearer " + builder.signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode("404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"))).compact();
    }

    @BeforeEach
    void setup() {
        for (String table : List.of("Order_Payment_Entries", "Processed_Events", "Outbox_Events", "Order_Item_Options", "Order_Status_History", "Order_Items", "Orders")) {
            jdbc.update("delete from " + table);
        }

        // Seed 2 completed orders for branch 1
        createOrder("ORD-001", 1, new BigDecimal("100000"), Types.Status.Completed);
        createOrder("ORD-002", 1, new BigDecimal("150000"), Types.Status.Completed);

        // Seed 1 completed order for branch 2
        createOrder("ORD-003", 2, new BigDecimal("200000"), Types.Status.Completed);

        // Seed 1 cancelled order for branch 1
        createOrder("ORD-004", 1, new BigDecimal("50000"), Types.Status.Cancelled);
    }

    private void createOrder(String code, Integer branchId, BigDecimal amount, Types.Status status) {
        CafeOrder order = new CafeOrder();
        order.orderCode = code;
        order.branchId = branchId;
        order.userId = "customer-1";
        order.orderSource = Types.Source.Online;
        order.fulfillmentType = Types.Fulfillment.Pickup;
        order.subTotal = amount;
        order.finalAmount = amount;
        order.status = status;
        order.paymentStatus = status == Types.Status.Completed ? Types.PaymentStatus.Paid : Types.PaymentStatus.Unpaid;
        order.version = 1;
        order.createdAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);
        order.updatedAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);
        if (status == Types.Status.Completed) {
            order.completedAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);
        }
        orders.save(order);
    }

    @Test
    void adminCanViewTotalRevenueOverview() throws Exception {
        var res = mvc.perform(get("/api/v1/orders/reports/revenue")
                        .header("Authorization", admin))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = json.readTree(res.getResponse().getContentAsString()).path("data");
        assertThat(data.path("summary").path("total_revenue").asDouble()).isEqualTo(450000.0);
        assertThat(data.path("summary").path("completed_orders").asInt()).isEqualTo(3);
        assertThat(data.path("summary").path("cancelled_orders").asInt()).isEqualTo(1);
        assertThat(data.path("summary").path("total_orders").asInt()).isEqualTo(4);

        // Check breakdown by branch
        JsonNode byBranch = data.path("by_branch");
        assertThat(byBranch.isArray()).isTrue();
        assertThat(byBranch.size()).isEqualTo(2);
    }

    @Test
    void adminCanViewRevenueByBranches() throws Exception {
        var res = mvc.perform(get("/api/v1/orders/reports/revenue/branches")
                        .header("Authorization", admin))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = json.readTree(res.getResponse().getContentAsString()).path("data");
        assertThat(data.path("total_revenue").asDouble()).isEqualTo(450000.0);
        assertThat(data.path("branches").size()).isEqualTo(2);

        // Branch 1 has 250,000, Branch 2 has 200,000
        JsonNode branch1 = data.path("branches").get(0);
        assertThat(branch1.path("branch_id").asInt()).isEqualTo(1);
        assertThat(branch1.path("final_amount").asDouble()).isEqualTo(250000.0);
    }

    @Test
    void managerWithBranchIdInTokenIsScopedToOwnBranch() throws Exception {
        var res = mvc.perform(get("/api/v1/orders/reports/revenue")
                        .header("Authorization", managerBranch1))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = json.readTree(res.getResponse().getContentAsString()).path("data");
        // Manager of branch 1 only sees branch 1 revenue (250,000)
        assertThat(data.path("summary").path("total_revenue").asDouble()).isEqualTo(250000.0);
        assertThat(data.path("summary").path("completed_orders").asInt()).isEqualTo(2);
    }

    @Test
    void customerCannotAccessRevenueReports() throws Exception {
        mvc.perform(get("/api/v1/orders/reports/revenue")
                        .header("Authorization", customer))
                .andExpect(status().isForbidden());
    }
}
