package com.smart_cafe_ai.catalog_service;
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
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional @Sql("/catalog-fixture.sql")
class CatalogResolveApiTest {
    @Autowired MockMvc mvc;
    @org.springframework.boot.test.mock.mockito.MockBean com.smart_cafe_ai.catalog_service.integration.StoreBranchVerifier store;
    private static final String BASE="/internal/catalog/resolve";
    private static final String VALID="{\"branch_id\":30,\"items\":[{\"variant_id\":11,\"options\":[{\"option_id\":1001},{\"option_id\":1003,\"quantity\":2}]}]}";
    private ResultActions resolve(String body) throws Exception {return mvc.perform(post(BASE).header("X-Service-Key","catalog-test-internal-key").contentType(MediaType.APPLICATION_JSON).content(body));}
    @Test void requiresServiceCredentialBeforeBindingAndRejectsUserJwt() throws Exception {
        for(String base:new String[]{BASE,"/api/v1/internal/catalog/resolve"}) {
            mvc.perform(post(base).contentType(MediaType.APPLICATION_JSON).content("{")).andExpect(status().isUnauthorized());
            mvc.perform(post(base).header("Authorization",CategoryAdminApiTest.token("Admin")).contentType(MediaType.APPLICATION_JSON).content(VALID)).andExpect(status().isUnauthorized());
            mvc.perform(post(base).header("X-Service-Key","wrong").contentType(MediaType.APPLICATION_JSON).content(VALID)).andExpect(status().isForbidden());
        }
    }
    @Test void resolvesTrustedCatalogSnapshotIncludingOptionQuantities() throws Exception {
        resolve(VALID).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].product_name").value("Latte"))
                .andExpect(jsonPath("$.data.items[0].price").value(40000))
                .andExpect(jsonPath("$.data.items[0].options[1].extra_price").value(5000))
                .andExpect(jsonPath("$.data.items[0].options[1].quantity").value(2));
    }
    @ParameterizedTest @ValueSource(strings={
            "{}","{\"branch_id\":0,\"items\":[]}","{\"branch_id\":30,\"items\":[]}",
            "{\"branch_id\":30,\"items\":[null]}","{\"branch_id\":30,\"items\":[{\"variant_id\":\"11\"}]}",
            "{\"branch_id\":30,\"items\":[{\"variant_id\":11,\"options\":[{\"option_id\":1001,\"quantity\":0}]}]}",
            "{\"branch_id\":30,\"items\":[{\"variant_id\":11,\"options\":[{\"option_id\":1001},{\"option_id\":1001}]}]}",
            "{\"branch_id\":30,\"items\":[{\"variant_id\":21,\"price\":1}]}"})
    void rejectsInvalidResolveInput(String body) throws Exception {resolve(body).andExpect(status().isBadRequest());}
    @ParameterizedTest @CsvSource({"41,30","51,30","13,30","11,10"})
    void rejectsInactiveProductsCategoriesVariantsOrBranchStock(int variant,int branch) throws Exception {
        resolve("{\"branch_id\":"+branch+",\"items\":[{\"variant_id\":"+variant+"}]}")
                .andExpect(status().isUnprocessableEntity());
    }
    @Test void requiresChoicesForRequiredGroups() throws Exception {
        resolve("{\"branch_id\":30,\"items\":[{\"variant_id\":11}]}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("BUSINESS_RULE_VIOLATION"));
    }
    @Test void enforcesSingleAndMultipleSelectionLimits() throws Exception {
        resolve(VALID.replace("\"option_id\":1001","\"quantity\":2,\"option_id\":1001")).andExpect(status().isUnprocessableEntity());
        resolve(VALID.replace("\"quantity\":2","\"quantity\":3")).andExpect(status().isUnprocessableEntity());
    }
    @Test void validatesOwnershipAndOptionLifecycleAndBranchStock() throws Exception {
        resolve("{\"branch_id\":30,\"items\":[{\"variant_id\":21,\"options\":[{\"option_id\":1001}]}]}").andExpect(status().isUnprocessableEntity());
        resolve(VALID.replace("1003","1004")).andExpect(status().isUnprocessableEntity());
        resolve(VALID.replace("\"branch_id\":30","\"branch_id\":10").replace("\"variant_id\":11","\"variant_id\":12"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("OUT_OF_STOCK"));
    }
    @Test void missingVariantOrOptionIsNotFoundAndNoPartialSnapshotIsReturned() throws Exception {
        resolve(VALID.replace("\"variant_id\":11","\"variant_id\":999999")).andExpect(status().isNotFound()).andExpect(jsonPath("$.data").doesNotExist());
        resolve(VALID.replace("1003","999999")).andExpect(status().isNotFound());
    }
    @Test void repeatedVariantWithDifferentOptionsMayRepresentSeparateCartLines() throws Exception {
        resolve("{\"branch_id\":30,\"items\":[{\"variant_id\":11,\"options\":[{\"option_id\":1001}]},{\"variant_id\":11,\"options\":[{\"option_id\":1002}]}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items",hasSize(2)));
    }
}
