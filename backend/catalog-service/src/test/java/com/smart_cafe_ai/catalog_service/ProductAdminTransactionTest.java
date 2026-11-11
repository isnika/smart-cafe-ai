package com.smart_cafe_ai.catalog_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.security.CatalogActor;
import com.smart_cafe_ai.catalog_service.service.ProductAdminService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql(scripts={"/catalog-cleanup.sql","/catalog-fixture.sql"},executionPhase=Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(scripts="/catalog-cleanup.sql",executionPhase=Sql.ExecutionPhase.AFTER_TEST_METHOD)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProductAdminTransactionTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ProductAdminService service;
    @Autowired ProductRepository products;
    @Autowired ProductOptionGroupRepository groups;
    @Autowired ProductOptionRepository options;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @SpyBean AuditLogRepository audits;
    @SpyBean ProductVariantRepository variants;
    @SpyBean OutboxEventRepository outbox;
    private static final CatalogActor ACTOR = new CatalogActor("manager-user","127.0.0.1");

    @Test void nestedCreateRollsBackAllChildrenWhenAuditFails() throws Exception {
        doThrow(new IllegalStateException("Audit failed")).when(audits).save(any(AuditLog.class));
        mvc.perform(post("/catalog/products").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON).content(ProductAdminApiTest.NESTED))
                .andExpect(status().isInternalServerError());
        assertEquals(7,products.count()); assertEquals(8,variants.count());
        assertEquals(2,groups.count()); assertEquals(4,options.count()); assertEquals(0,audits.count());
    }

    @Test void outboxFailureRollsBackStatusAndAudit() throws Exception {
        doThrow(new IllegalStateException("Outbox failed")).when(outbox).save(any(OutboxEvent.class));
        mvc.perform(patch("/catalog/products/1/status").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"Inactive\"}"))
                .andExpect(status().isInternalServerError());
        assertEquals(MenuStatus.Active,products.findById(1).orElseThrow().getStatus());
        assertEquals(0,audits.count()); assertEquals(0,outbox.count());
    }

    @Test void putRollsBackNameCategoryAndStatusWhenOutboxFails() throws Exception {
        doThrow(new IllegalStateException("Outbox failed")).when(outbox).save(any(OutboxEvent.class));
        mvc.perform(put("/catalog/products/1").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category_id\":2,\"name\":\"Should rollback\",\"status\":\"Inactive\"}"))
                .andExpect(status().isInternalServerError());
        var product=products.findById(1).orElseThrow();
        assertEquals("Latte",product.getName()); assertEquals(1,product.getCategory().getId());
        assertEquals(MenuStatus.Active,product.getStatus()); assertEquals(0,audits.count());
    }

    @Test void deleteRollsBackWhenAuditFails() throws Exception {
        doThrow(new IllegalStateException("Audit failed")).when(audits).save(any(AuditLog.class));
        mvc.perform(delete("/catalog/products/6").header("Authorization",CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isInternalServerError());
        assertTrue(products.existsById(6)); assertEquals(0,audits.count());
    }

    @Test void databaseForeignKeyStillBlocksDeletionWhenPrecheckMissesVariant() throws Exception {
        doReturn(false).when(variants).existsByProductId(2);
        mvc.perform(delete("/catalog/products/2").header("Authorization",CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("PRODUCT_IN_USE"));
        assertTrue(products.existsById(2)); assertTrue(variants.existsById(21)); assertEquals(0,audits.count());
    }

    @Test void concurrentCreatesMayHaveSameNameAsAllowedBySchema() throws Exception {
        var request=json.readValue("{\"category_id\":1,\"name\":\"Concurrent product\"}",ProductCreateRequest.class);
        var codes=parallel(() -> {
            try {service.create(request,ACTOR);return 201;} catch(ApiException ex){return ex.getStatus().value();}
        });
        assertEquals(List.of(201,201),codes.stream().sorted().toList());
        assertEquals(9,products.count()); assertEquals(2,audits.count());
    }

    @Test void concurrentStatusChangesGenerateOneAuditAndEvent() throws Exception {
        var codes=parallel(() -> {service.status(1,MenuStatus.Inactive,ACTOR);return 200;});
        assertEquals(List.of(200,200),codes);
        assertEquals(1,audits.count()); assertEquals(1,outbox.count());
    }

    @Test void concurrentDeletesHaveOneWinnerAndOneAudit() throws Exception {
        var codes=parallel(() -> {
            try{service.delete(6,ACTOR);return 200;}catch(ApiException ex){return ex.getStatus().value();}
        });
        assertEquals(List.of(200,404),codes.stream().sorted().toList());
        assertFalse(products.existsById(6)); assertEquals(1,audits.count());
    }

    @Test void outboxDoesNotPublishNewerProductEventBeforeOlderPendingEvent() {
        service.status(1,MenuStatus.Inactive,ACTOR);
        service.status(1,MenuStatus.Active,ACTOR);
        service.status(2,MenuStatus.Inactive,ACTOR);
        var events=outbox.findAll();
        var pending=new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        pending.executeWithoutResult(tx -> {
            var ready=outbox.findReady(OutboxEvent.PRODUCT_STATUS_CHANGED,OutboxEvent.Status.Pending,
                    LocalDateTime.now(ZoneOffset.UTC),org.springframework.data.domain.PageRequest.of(0,10));
            assertEquals(2,ready.size());
            assertEquals(List.of(events.get(0).getId(),events.get(2).getId()),ready.stream().map(OutboxEvent::getId).toList());
        });
    }

    private List<Integer> parallel(Callable<Integer> operation) throws Exception {
        var pool=Executors.newFixedThreadPool(2);
        var start=new CyclicBarrier(2);
        try {
            Callable<Integer> task=() -> {start.await(10,TimeUnit.SECONDS);return operation.call();};
            var a=pool.submit(task);var b=pool.submit(task);
            return List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
        }finally{pool.shutdownNow();}
    }
}
