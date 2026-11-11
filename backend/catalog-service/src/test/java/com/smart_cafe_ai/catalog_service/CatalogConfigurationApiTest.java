package com.smart_cafe_ai.catalog_service;

import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.model.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional @Sql("/catalog-fixture.sql")
class CatalogConfigurationApiTest {
    @Autowired MockMvc mvc;
    @org.springframework.boot.test.mock.mockito.MockBean com.smart_cafe_ai.catalog_service.integration.StoreBranchVerifier store;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired VariantPriceHistoryRepository histories;
    @Autowired OutboxEventRepository outbox;
    @Autowired AuditLogRepository audits;
    @Autowired ProductVariantRepository variants;
    @Autowired ProductOptionRepository options;

    private ResultActions write(MockHttpServletRequestBuilder request,String body) throws Exception {
        return mvc.perform(request.header("Authorization",CategoryAdminApiTest.token("Manager")).contentType(MediaType.APPLICATION_JSON).content(body));
    }
    private int id(ResultActions result) throws Exception {return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data").path("id").asInt();}
    private List<MockHttpServletRequestBuilder> routes(String base) {
        return List.of(post(base+"/products/6/variants"),put(base+"/variants/11"),patch(base+"/variants/11/price"),
                get(base+"/variants/11/price-history"),patch(base+"/variants/11/status"),
                post(base+"/products/6/option-groups"),put(base+"/option-groups/101"),post(base+"/option-groups/101/options"),
                put(base+"/options/1001"),patch(base+"/options/1001/status"),put(base+"/branches/10/variants/11/availability"),
                put(base+"/branches/10/options/1001/availability"));
    }
    @Test void allTwelveRoutesRequireAuthOnBothAliasesBeforeBinding() throws Exception {
        for(String base:List.of("/catalog","/api/v1/catalog")) for(var request:routes(base))
            mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content("{")).andExpect(status().isUnauthorized());
    }
    @Test void customerCannotManageConfiguration() throws Exception {
        for(var request:routes("/catalog")) mvc.perform(request.header("Authorization",CategoryAdminApiTest.token("Customer"))
                .contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings={"Manager","Admin"})
    void createsVariantAndMakesPreviouslyUnpricedProductSellable(String role) throws Exception {
        mvc.perform(post("/catalog/products/6/variants").header("Authorization",CategoryAdminApiTest.token(role))
                .contentType(MediaType.APPLICATION_JSON).content("{\"variant_name\":\"Standard\",\"price\":15000}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.product_id").value(6));
        em.flush();em.clear();
        mvc.perform(get("/catalog/products/6")).andExpect(status().isOk()).andExpect(jsonPath("$.data.price").value(15000))
                .andExpect(jsonPath("$.data.is_available").value(true));
    }
    @Test void updateVariantCannotChangePriceAndChecksScopedUniqueness() throws Exception {
        write(put("/catalog/variants/11"),"{\"variant_name\":\"New M\",\"sort_order\":8,\"status\":\"Inactive\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.price").value(40000));
        write(put("/catalog/variants/11"),"{\"variant_name\":\"L\"}").andExpect(status().isConflict());
        write(put("/catalog/variants/11"),"{\"variant_name\":\"M\",\"price\":1}").andExpect(status().isBadRequest());
        assertEquals(0,histories.count());assertEquals(0,outbox.count());
    }
    @Test void priceChangeWritesHistoryAuditAndOutboxExactlyOnce() throws Exception {
        String trace="c4c809f0-b29b-4cce-83c5-247e4e577632";
        write(patch("/catalog/variants/11/price").header("X-Trace-Id",trace),"{\"price\":42000}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.price").value(42000))
                .andExpect(jsonPath("$.trace_id").value(trace)).andExpect(header().string("X-Trace-Id",trace));
        write(patch("/catalog/variants/11/price"),"{\"price\":42000}").andExpect(status().isOk());
        assertEquals(1,histories.count());assertEquals(1,outbox.count());assertEquals(1,audits.count());
        var history=histories.findAll().get(0);
        assertEquals("manager-user",history.getChangedBy());assertEquals(40000,history.getOldPrice().intValue());
        assertEquals(OutboxEvent.VARIANT_PRICE_CHANGED,outbox.findAll().get(0).getEventType());
        assertEquals(trace,outbox.findAll().get(0).getCorrelationId());
        mvc.perform(get("/catalog/variants/11/price-history").header("Authorization",CategoryAdminApiTest.token("Manager")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(1))
                .andExpect(jsonPath("$.data[0].new_price").value(42000));
    }
    @ParameterizedTest @ValueSource(strings={"{}","{\"price\":null}","{\"price\":-1}","{\"price\":1.5}","{\"price\":\"1000\"}","{\"price\":1000000000000000}"})
    void rejectsInvalidPricesWithoutSideEffects(String body) throws Exception {
        write(patch("/catalog/variants/11/price"),body).andExpect(status().isBadRequest());
        assertEquals(0,histories.count());assertEquals(0,outbox.count());
    }
    @Test void configurationCanBeCreatedInStagesMatchingSql() throws Exception {
        int group=id(write(post("/catalog/products/6/option-groups"),"{\"name\":\"Required draft\",\"selection_type\":\"Single\",\"is_required\":true,\"min_select\":1}")
                .andExpect(status().isCreated()));
        int option=id(write(post("/catalog/option-groups/"+group+"/options"),"{\"option_name\":\"Normal\"}").andExpect(status().isCreated()));
        write(put("/catalog/option-groups/"+group),"{\"name\":\"Optional two\",\"selection_type\":\"Multiple\",\"min_select\":2,\"max_select\":3}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.min_select").value(2));
        write(put("/catalog/options/"+option),"{\"option_name\":\"Updated\",\"extra_price\":5000,\"status\":\"Inactive\",\"is_default\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.extra_price").value(5000));
        assertEquals(0,histories.count());
    }
    @Test void nestedPostAlsoAllowsDraftRequiredGroups() throws Exception {
        write(post("/catalog/products"),"{\"category_id\":1,\"name\":\"Draft configuration\",\"option_groups\":[{\"name\":\"Required\",\"selection_type\":\"Single\",\"is_required\":true,\"min_select\":1}]}")
                .andExpect(status().isCreated());
    }
    @Test void duplicateNamesAreRejectedOnlyInTheirDatabaseUniqueScopes() throws Exception {
        write(post("/catalog/products/1/variants"),"{\"variant_name\":\"M\",\"price\":0}").andExpect(status().isConflict());
        write(post("/catalog/products/1/option-groups"),"{\"name\":\"Sugar\",\"selection_type\":\"Single\"}").andExpect(status().isConflict());
        write(post("/catalog/option-groups/101/options"),"{\"option_name\":\"Normal\"}").andExpect(status().isConflict());
        write(post("/catalog/products/6/variants"),"{\"variant_name\":\"M\",\"price\":0}").andExpect(status().isCreated());
    }
    @ParameterizedTest @ValueSource(strings={
            "{\"name\":\"Invalid\",\"selection_type\":\"Single\",\"max_select\":2}",
            "{\"name\":\"Invalid\",\"selection_type\":\"Multiple\",\"min_select\":3,\"max_select\":2}",
            "{\"name\":\"Invalid\",\"selection_type\":\"Single\",\"is_required\":true}",
            "{\"name\":\"Invalid\",\"selection_type\":\"Single\",\"options\":[]}"})
    void standaloneGroupValidatesSqlRulesAndRejectsNestedOptions(String body) throws Exception {
        write(post("/catalog/products/6/option-groups"),body).andExpect(status().isBadRequest());
    }
    @Test void availabilityOverridesAreBranchScopedAndRestoreToAvailable() throws Exception {
        write(put("/catalog/branches/20/variants/11/availability"),"{\"is_available\":true,\"unavailable_reason\":\"Ignored when available\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.unavailable_reason").value(nullValue()));
        mvc.perform(get("/catalog/products/1").param("branch_id","20")).andExpect(status().isOk()).andExpect(jsonPath("$.data.is_available").value(true));
        write(put("/catalog/branches/10/options/1003/availability"),"{\"is_available\":false,\"unavailable_reason\":\"No pearls\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.branch_id").value(10));
        assertEquals(MenuStatus.Active,options.findById(1003).orElseThrow().getStatus());
    }
    @Test void variantAndOptionStatusDoNotChangeProductOrPrice() throws Exception {
        for(int i=0;i<2;i++) write(patch("/catalog/variants/11/status"),"{\"status\":\"Inactive\"}").andExpect(status().isOk());
        for(int i=0;i<2;i++) write(patch("/catalog/options/1001/status"),"{\"status\":\"Inactive\"}").andExpect(status().isOk());
        assertEquals(2,audits.count());assertEquals(0,histories.count());assertEquals(0,outbox.count());
    }
    @Test void historyPaginationAndMissingResources() throws Exception {
        mvc.perform(get("/catalog/variants/11/price-history").header("Authorization",CategoryAdminApiTest.token("Admin")).param("size","101")).andExpect(status().isBadRequest());
        write(put("/catalog/variants/99999"),"{\"variant_name\":\"M\"}").andExpect(status().isNotFound());
        write(post("/catalog/products/99999/variants"),"{\"variant_name\":\"M\",\"price\":0}").andExpect(status().isNotFound());
        write(patch("/catalog/variants/0/status"),"{\"status\":\"Active\"}").andExpect(status().isBadRequest());
        write(put("/catalog/branches/0/variants/11/availability"),"{\"is_available\":true}").andExpect(status().isBadRequest());
        write(put("/catalog/branches/10/variants/11/availability"),"{}").andExpect(status().isBadRequest());
    }
}
