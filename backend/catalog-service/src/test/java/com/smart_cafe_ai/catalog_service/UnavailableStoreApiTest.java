package com.smart_cafe_ai.catalog_service;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties={"app.store.internal-base-url=","app.store.auth-header=","app.store.auth-value="})
@AutoConfigureMockMvc @ActiveProfiles("test") @Transactional @Sql("/catalog-fixture.sql")
class UnavailableStoreApiTest {
    @Autowired MockMvc mvc;
    @Test void branchDependentApisFailClearlyUntilStoreIsIntegrated() throws Exception {
        mvc.perform(get("/catalog/products").param("branch_id","1")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("STORE_INTEGRATION_NOT_CONFIGURED"));
        mvc.perform(put("/catalog/branches/1/variants/11/availability").header("Authorization",CategoryAdminApiTest.token("Admin"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"is_available\":true}"))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(post("/internal/catalog/resolve").header("X-Service-Key","catalog-test-internal-key")
                .contentType(MediaType.APPLICATION_JSON).content("{\"branch_id\":1,\"items\":[{\"variant_id\":21}]}"))
                .andExpect(status().isServiceUnavailable());
    }
    @Test void globalMenuAndProductManagementRemainIndependentOfStore() throws Exception {
        mvc.perform(get("/catalog/products")).andExpect(status().isOk());
        mvc.perform(get("/catalog/admin/products").header("Authorization",CategoryAdminApiTest.token("Admin"))).andExpect(status().isOk());
    }
}
