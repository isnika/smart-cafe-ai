package com.smart_cafe_ai.catalog_service;

import com.smart_cafe_ai.catalog_service.dto.category.CategoryRequest;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.security.CatalogActor;
import com.smart_cafe_ai.catalog_service.service.CategoryAdminService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
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
class CategoryAdminTransactionTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired CategoryAdminService service;
    @SpyBean CategoryRepository categories;
    @SpyBean AuditLogRepository audits;
    @SpyBean ProductRepository products;
    private static final CatalogActor ACTOR = new CatalogActor("manager-user","127.0.0.1");

    @Test void auditFailureRollsBackCreatedCategory() throws Exception {
        doThrow(new IllegalStateException("Simulated audit failure")).when(audits).save(any(AuditLog.class));
        mvc.perform(post("/catalog/categories").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Rollback category\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error.message").value("Hệ thống đang gặp sự cố. Vui lòng thử lại sau."));
        assertFalse(categories.existsByNameIgnoreCase("Rollback category"));
        assertEquals(4,categories.count()); assertEquals(0,audits.count());
    }

    @Test void auditFailureRollsBackStatusChange() throws Exception {
        doThrow(new IllegalStateException("Simulated audit failure")).when(audits).save(any(AuditLog.class));
        mvc.perform(patch("/catalog/categories/1/status").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"Inactive\"}"))
                .andExpect(status().isInternalServerError());
        assertEquals(MenuStatus.Active,categories.findById(1).orElseThrow().getStatus());
        assertEquals(MenuStatus.Active,products.findById(1).orElseThrow().getStatus());
        assertEquals(0,audits.count());
    }

    @Test void auditFailureRollsBackPut() throws Exception {
        doThrow(new IllegalStateException("Simulated audit failure")).when(audits).save(any(AuditLog.class));
        mvc.perform(put("/catalog/categories/1").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rollback rename\",\"sort_order\":8,\"status\":\"Inactive\"}"))
                .andExpect(status().isInternalServerError());
        var category = categories.findById(1).orElseThrow();
        assertEquals("Coffee",category.getName());
        assertEquals(1,category.getSortOrder());
        assertEquals(MenuStatus.Active,category.getStatus());
        assertEquals(0,audits.count());
    }

    @Test void lockContentionReturnsConflict() throws Exception {
        doThrow(new org.springframework.dao.CannotAcquireLockException("Simulated lock timeout"))
                .when(categories).findByIdForUpdate(1);
        mvc.perform(patch("/catalog/categories/1/status").header("Authorization",CategoryAdminApiTest.token("Manager"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"Inactive\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("CONCURRENT_MODIFICATION"));
        assertEquals(MenuStatus.Active,categories.findById(1).orElseThrow().getStatus());
        assertEquals(0,audits.count());
    }

    @Test void simultaneousDuplicateCreatesHaveOneWinnerAndOneConflict() throws Exception {
        CyclicBarrier precheck = new CyclicBarrier(2);
        doAnswer(invocation -> {
            precheck.await(10,TimeUnit.SECONDS);
            return false;
        }).when(categories).existsByNameIgnoreCase("Race category");
        var request = json.readValue("{\"name\":\"Race category\"}",CategoryRequest.class);
        List<Integer> codes = parallel(() -> {
            try { service.create(request,ACTOR); return 201; }
            catch(ApiException ex) { return ex.getStatus().value(); }
        });
        assertEquals(List.of(201,409),codes.stream().sorted().toList());
        assertEquals(5,categories.count()); assertEquals(1,audits.count());
    }

    @Test void concurrentSameStatusChangesAreSerializedAndAuditedOnce() throws Exception {
        CyclicBarrier start = new CyclicBarrier(2);
        parallel(() -> {
            start.await(10,TimeUnit.SECONDS);
            service.status(1,MenuStatus.Inactive,ACTOR);
            return 200;
        });
        assertEquals(MenuStatus.Inactive,categories.findById(1).orElseThrow().getStatus());
        assertEquals(1,audits.count());
    }

    @Test void auditFailureRollsBackPermanentDeletion() throws Exception {
        doThrow(new IllegalStateException("Simulated audit failure")).when(audits).save(any(AuditLog.class));
        mvc.perform(delete("/catalog/categories/4").header("Authorization",CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error.message").value("Hệ thống đang gặp sự cố. Vui lòng thử lại sau."));
        assertEquals("Empty",categories.findById(4).orElseThrow().getName());
        assertEquals(4,categories.count());
        assertEquals(7,products.count());
        assertEquals(0,audits.count());
    }

    @Test void databaseForeignKeyBlocksDeleteIfDependencyPrecheckMissesAProduct() throws Exception {
        // Simulate a stale dependency precheck. The actual database FK must still protect the product.
        doReturn(false).when(products).existsByCategoryId(1);
        mvc.perform(delete("/catalog/categories/1").header("Authorization",CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("CATEGORY_IN_USE"))
                .andExpect(jsonPath("$.error.message").value(
                        "Không thể xóa danh mục vì vẫn còn dữ liệu liên kết cần bảo toàn. Vui lòng chuyển danh mục sang Inactive để ngừng hiển thị."));
        assertTrue(categories.existsById(1));
        assertEquals(7,products.count());
        assertEquals(0,audits.count());
    }

    @Test void concurrentDeletesRemoveTheCategoryAndRecordAuditOnlyOnce() throws Exception {
        CyclicBarrier start=new CyclicBarrier(2);
        var codes=parallel(() -> {
            start.await(10,TimeUnit.SECONDS);
            try { service.delete(4,ACTOR); return 200; }
            catch(ApiException ex) { return ex.getStatus().value(); }
        });
        assertEquals(List.of(200,404),codes.stream().sorted().toList());
        assertFalse(categories.existsById(4));
        assertEquals(1,audits.count());
        assertEquals("CATEGORY_DELETED",audits.findAll().get(0).getAction());
    }

    private List<Integer> parallel(Callable<Integer> action) throws Exception {
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try {
            Future<Integer> a=pool.submit(action), b=pool.submit(action);
            return List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5,TimeUnit.SECONDS));
        }
    }
}

