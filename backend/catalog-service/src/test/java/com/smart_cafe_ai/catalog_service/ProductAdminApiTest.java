package com.smart_cafe_ai.catalog_service;

import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.util.stream.Stream;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@Sql("/catalog-fixture.sql")
class ProductAdminApiTest {
    private static final String BASE = "/catalog";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ProductRepository products;
    @Autowired ProductVariantRepository variants;
    @Autowired ProductOptionGroupRepository groups;
    @Autowired ProductOptionRepository options;
    @Autowired AuditLogRepository audits;
    @Autowired OutboxEventRepository outbox;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request) {
        return request.header("Authorization", CategoryAdminApiTest.token("Manager"));
    }
    private ResultActions write(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(auth(request).contentType(MediaType.APPLICATION_JSON).content(body));
    }
    private JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
    }

    @Test void adminRoutesRequireAuthenticationOnBothAliasesBeforeBinding() throws Exception {
        for (String prefix : List.of(BASE, "/api/v1/catalog")) {
            for (var request : List.of(get(prefix+"/admin/products"), post(prefix+"/products"),
                    put(prefix+"/products/1"), patch(prefix+"/products/1/status"), delete(prefix+"/products/6"))) {
                mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content("{").header("X-Role","Admin"))
                        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
            }
        }
        assertEquals(0, audits.count());
    }

    @ParameterizedTest @ValueSource(strings={"Customer","Staff",""})
    void rejectsNonManagerRoles(String role) throws Exception {
        for (var request : List.of(get(BASE+"/admin/products"),post(BASE+"/products"),put(BASE+"/products/1"),
                patch(BASE+"/products/1/status"),delete(BASE+"/products/6"))) {
            mvc.perform(request.header("Authorization",CategoryAdminApiTest.token(role)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden());
        }
    }

    @ParameterizedTest @ValueSource(strings={"Manager","Admin"})
    void managementListIncludesInactiveAndHiddenCategoryProductsAndCounts(String role) throws Exception {
        mvc.perform(get(BASE+"/admin/products").header("Authorization",CategoryAdminApiTest.token(role)).param("sort","id"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(7))
                .andExpect(jsonPath("$.data[0].variant_count").value(3))
                .andExpect(jsonPath("$.data[0].active_variant_count").value(2))
                .andExpect(jsonPath("$.data[0].option_group_count").value(2))
                .andExpect(jsonPath("$.data[0].price").value(40000)).andExpect(jsonPath("$.data[0].max_price").value(50000))
                .andExpect(jsonPath("$.data[0].is_available").value(true))
                .andExpect(jsonPath("$.data[3].status").value("Inactive"))
                .andExpect(jsonPath("$.data[3].is_available").value(false))
                .andExpect(jsonPath("$.data[4].category_status").value("Inactive"))
                .andExpect(jsonPath("$.data[4].is_available").value(false))
                .andExpect(jsonPath("$.data[5].price").value(nullValue()))
                .andExpect(jsonPath("$.data[5].is_available").value(false))
                .andExpect(jsonPath("$.data[6].variant_count").value(1))
                .andExpect(jsonPath("$.data[6].active_variant_count").value(0));
        assertEquals(0,audits.count()); assertEquals(0,outbox.count());
    }

    @Test void listFiltersAndStablePagination() throws Exception {
        mvc.perform(auth(get(BASE+"/admin/products")).param("category_id","1").param("status","Inactive"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(1))
                .andExpect(jsonPath("$.data[0].id").value(4));
        var first=data(mvc.perform(auth(get(BASE+"/admin/products")).param("sort","sort_order,desc").param("size","2"))
                .andExpect(status().isOk()));
        assertEquals(7,first.get(0).get("id").asInt());
        assertEquals(6,first.get(1).get("id").asInt());
        mvc.perform(auth(get(BASE+"/admin/products")).param("page","100"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data",hasSize(0)))
                .andExpect(jsonPath("$.meta.total").value(7)).andExpect(jsonPath("$.message",containsString("Trang này")));
        mvc.perform(auth(get(BASE+"/admin/products")).param("q","not found"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(0))
                .andExpect(jsonPath("$.message",containsString("Không tìm thấy")));
        mvc.perform(auth(get(BASE+"/admin/products")).param("category_id","999999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data",hasSize(0)));
    }

    @Test void vietnameseSearchHandlesAccentsDAndLiteralWildcards() throws Exception {
        var created=data(write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"Đồ uống Cà phê 100%_!\"}")
                .andExpect(status().isCreated()));
        for(String q:List.of("do uong ca phe","ĐỒ UỐNG","%_!")) {
            mvc.perform(auth(get(BASE+"/admin/products")).param("q",q))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.meta.total").value(1))
                    .andExpect(jsonPath("$.data[0].id").value(created.get("id").asInt()));
        }
    }

    @ParameterizedTest @CsvSource({"page,0","page,-1","page,x","page,2147483647","size,0","size,101","size,x",
            "category_id,0","category_id,x","status,active","status,Wrong","sort,unknown","sort,name;drop table Products"})
    void rejectsInvalidListFilters(String key,String value) throws Exception {
        var result = mvc.perform(auth(get(BASE+"/admin/products")).param(key,value)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        if (key.equals("status")) result.andExpect(jsonPath("$.error.message",containsString("sản phẩm")));
    }

    @Test void createMinimalNormalizesNameAndSetsDefaults() throws Exception {
        var result=write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"  New   product  \"}")
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.data.name").value("New product"))
                .andExpect(jsonPath("$.data.caffeine_level").value("None"))
                .andExpect(jsonPath("$.data.sort_order").value(0))
                .andExpect(jsonPath("$.data.status").value("Active"))
                .andExpect(jsonPath("$.data.flavor_tags",hasSize(0)))
                .andExpect(jsonPath("$.data.variants",hasSize(0)))
                .andExpect(jsonPath("$.data.option_groups",hasSize(0)))
                .andExpect(jsonPath("$.data.created_at").isNotEmpty())
                .andExpect(jsonPath("$.data.updated_at").isNotEmpty())
                .andExpect(jsonPath("$.message",containsString("chưa có biến thể Active")));
        var id=data(result).get("id").asInt();
        var audit=audits.findAll().get(0);
        assertEquals("Product",audit.getEntityType()); assertEquals("PRODUCT_CREATED",audit.getAction());
        assertEquals(Integer.toString(id),audit.getEntityId()); assertEquals("manager-user",audit.getActorUserId());
        assertEquals(0,outbox.count());
    }

    static final String NESTED = """
        {"category_id":1,"name":"New coffee","description":" Milk coffee ","temperature":"Iced",
         "caffeine_level":"Medium","flavor_tags":[" SWEET ","sweet","Creamy"],"sort_order":4,
         "variants":[{"variant_name":"L","price":50000,"sort_order":2},
                     {"variant_name":"M","price":40000,"sort_order":1},
                     {"variant_name":"Old","price":1,"status":"Inactive"}],
         "option_groups":[{"name":"Sugar","selection_type":"Single","is_required":true,"min_select":1,"max_select":1,
            "options":[{"option_name":"Normal","is_default":true},{"option_name":"Less","extra_price":0}]}]}
        """;

    @Test void createNestedProductIsVisibleWithDerivedPricesAndAllChildren() throws Exception {
        var created=data(write(post(BASE+"/products"),NESTED).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.price").value(40000)).andExpect(jsonPath("$.data.max_price").value(50000))
                .andExpect(jsonPath("$.data.flavor_tags",contains("sweet","creamy")))
                .andExpect(jsonPath("$.data.variants",hasSize(3)))
                .andExpect(jsonPath("$.data.variants[1].variant_name").value("M"))
                .andExpect(jsonPath("$.data.option_groups[0].options",hasSize(2)))
                .andExpect(jsonPath("$.data.is_available").value(true)));
        int id=created.get("id").asInt();
        mvc.perform(get(BASE+"/products/"+id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.variants",hasSize(2)))
                .andExpect(jsonPath("$.data.option_groups[0].options",hasSize(2)));
        assertEquals(11,variants.count()); assertEquals(3,groups.count()); assertEquals(6,options.count());
        assertTrue(audits.findAll().get(0).getNewValue().containsKey("variants"));
    }

    @Test void canCreateInactiveOrInInactiveCategoryWithoutExposingToCustomers() throws Exception {
        int id=data(write(post(BASE+"/products"),"{\"category_id\":3,\"name\":\"Hidden new\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.message",containsString("Danh mục đang Inactive"))))
                .get("id").asInt();
        mvc.perform(get(BASE+"/products/"+id)).andExpect(status().isNotFound());
        int inactive=data(write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"Draft\",\"status\":\"Inactive\"}")
                .andExpect(status().isCreated())).get("id").asInt();
        mvc.perform(get(BASE+"/products/"+inactive)).andExpect(status().isNotFound());
    }

    @Test void productNamesAreNotUniqueAccordingToOriginalSchema() throws Exception {
        write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\" latte \"}").andExpect(status().isCreated());
        write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"RETIRED\"}").andExpect(status().isCreated());
        write(post(BASE+"/products"),"{\"category_id\":2,\"name\":\"Latte\"}").andExpect(status().isCreated());
        assertEquals(3,audits.count());
    }

    static Stream<String> invalidProducts() {
        return Stream.of("{}","null","{\"category_id\":1}","{\"category_id\":1,\"name\":\"   \"}",
                "{\"category_id\":0,\"name\":\"Invalid\"}","{\"category_id\":\"1\",\"name\":\"Invalid\"}",
                "{\"category_id\":1,\"name\":123}","{\"category_id\":1,\"name\":\""+"x".repeat(101)+"\"}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"description\":123}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"image\":\"javascript:alert(1)\"}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"temperature\":0}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"temperature\":\"hot\"}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"caffeine_level\":null}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"caffeine_level\":0}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"flavor_tags\":[123]}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"flavor_tags\":[null]}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"flavor_tags\":\"sweet\"}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"sort_order\":-1}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"sort_order\":1.2}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"status\":\"active\"}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"status\":null}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"price\":100}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"variants\":null}",
                "{\"category_id\":1,\"name\":\"Invalid\",\"variants\":[null]}");
    }
    @ParameterizedTest @MethodSource("invalidProducts")
    void validatesStrictProductJson(String body) throws Exception {
        write(post(BASE+"/products"),body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertEquals(7,products.count()); assertEquals(0,audits.count());
    }

    @ParameterizedTest @ValueSource(strings={
            "{\"variant_name\":\"M\"}","{\"variant_name\":\"M\",\"price\":-1}",
            "{\"variant_name\":\"M\",\"price\":1.5}","{\"variant_name\":\"M\",\"price\":\"1000\"}",
            "{\"variant_name\":\"M\",\"price\":1000000000000000}","{\"variant_name\":\"\",\"price\":0}"})
    void validatesNestedVariantPrices(String variant) throws Exception {
        write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"Invalid\",\"variants\":["+variant+"]}")
                .andExpect(status().isBadRequest());
        assertEquals(7,products.count()); assertEquals(8,variants.count());
    }

    @ParameterizedTest @ValueSource(strings={
            "{\"name\":\"Sugar\",\"selection_type\":\"Single\",\"max_select\":2}",
            "{\"name\":\"Sugar\",\"selection_type\":\"Single\",\"is_required\":true}",
            "{\"name\":\"Sugar\",\"selection_type\":\"Single\",\"is_required\":\"true\"}",
            "{\"name\":\"Sugar\",\"selection_type\":0}",
            "{\"name\":\"Sugar\",\"selection_type\":\"Multiple\",\"max_select\":256}"})
    void validatesOptionGroupBusinessRules(String group) throws Exception {
        write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"Invalid\",\"option_groups\":["+group+"]}")
                .andExpect(status().isBadRequest());
        assertEquals(0,audits.count()); assertEquals(7,products.count());
    }

    @Test void rejectsDuplicateConfigurationAndMissingCategoryWithoutWrites() throws Exception {
        write(post(BASE+"/products"),NESTED.replace("\"variant_name\":\"L\"","\"variant_name\":\"m\""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("DUPLICATE_PRODUCT_CONFIGURATION"));
        write(post(BASE+"/products"),"{\"category_id\":999999,\"name\":\"Missing category\"}")
                .andExpect(status().isNotFound());
        assertEquals(7,products.count()); assertEquals(0,audits.count());
    }

    @Test void putReplacesMetadataPreservesChildrenAndEmitsEventOnlyForStatusChange() throws Exception {
        write(put(BASE+"/products/1"),"{\"category_id\":2,\"name\":\"Updated latte\",\"status\":\"Inactive\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.category_id").value(2))
                .andExpect(jsonPath("$.data.description").value(nullValue()))
                .andExpect(jsonPath("$.data.caffeine_level").value("None"))
                .andExpect(jsonPath("$.data.flavor_tags",hasSize(0)))
                .andExpect(jsonPath("$.data.variant_count").value(3)).andExpect(jsonPath("$.data.price").value(40000));
        assertEquals(8,variants.count()); assertEquals(2,groups.count()); assertEquals(1,outbox.count());
        write(put(BASE+"/products/1"),"{\"category_id\":2,\"name\":\"Updated latte\",\"status\":\"Inactive\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Thông tin sản phẩm không thay đổi."));
        assertEquals(1,audits.count()); assertEquals(1,outbox.count());
        write(put(BASE+"/products/1"),"{\"category_id\":2,\"name\":\"Updated again\",\"status\":\"Inactive\"}")
                .andExpect(status().isOk());
        assertEquals(2,audits.count()); assertEquals(1,outbox.count());
    }

    @Test void putAllowsDuplicateProductNamesButRejectsNestedReplacement() throws Exception {
        write(put(BASE+"/products/1"),"{\"category_id\":1,\"name\":\"Americano\"}")
                .andExpect(status().isOk());
        write(put(BASE+"/products/1"),"{\"category_id\":1,\"name\":\"Latte\",\"variants\":[]}")
                .andExpect(status().isBadRequest());
        assertEquals(1,audits.count());
    }

    @Test void statusIsIdempotentAndDoesNotCascadeToChildren() throws Exception {
        for(int i=0;i<2;i++) write(patch(BASE+"/products/1/status"),"{\"status\":\"Inactive\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("Inactive"))
                .andExpect(jsonPath("$.data.updated_at").isNotEmpty());
        assertEquals(1,audits.count()); assertEquals(1,outbox.count());
        var event=outbox.findAll().get(0);
        assertEquals(OutboxEvent.PRODUCT_STATUS_CHANGED,event.getEventType());
        assertEquals(OutboxEvent.Status.Pending,event.getStatus());
        assertEquals("Inactive",event.getPayload().get("status"));
        assertEquals(1,event.getPayload().get("product_id"));
        assertEquals(event.getEventId(),event.getPayload().get("event_id"));
        assertEquals(MenuStatus.Active,variants.findById(11).orElseThrow().getStatus());
        assertEquals(MenuStatus.Inactive,variants.findById(13).orElseThrow().getStatus());
        mvc.perform(get(BASE+"/products/1")).andExpect(status().isNotFound());
        write(patch(BASE+"/products/1/status"),"{\"status\":\"Active\"}").andExpect(status().isOk());
        mvc.perform(get(BASE+"/products/1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.variants",hasSize(2)));
        assertEquals(2,outbox.count());
    }

    @ParameterizedTest @ValueSource(strings={"{}","{\"status\":null}","{\"status\":0}","{\"status\":\"active\"}",
            "{\"status\":\"Active\",\"name\":\"Changed\"}"})
    void statusRequiresOnlyAnExplicitValidStatus(String body) throws Exception {
        write(patch(BASE+"/products/1/status"),body).andExpect(status().isBadRequest());
        assertEquals(0,outbox.count());
    }

    @ParameterizedTest @ValueSource(strings={"0","-1","x","%7B6%7D"})
    void validatesIds(String id) throws Exception {
        write(put(BASE+"/products/"+id),"{\"category_id\":1,\"name\":\"Valid\"}").andExpect(status().isBadRequest());
        write(patch(BASE+"/products/"+id+"/status"),"{\"status\":\"Active\"}").andExpect(status().isBadRequest());
        mvc.perform(auth(delete(BASE+"/products/"+id))).andExpect(status().isBadRequest());
    }

    @Test void missingProductsAndWrongContentType() throws Exception {
        write(put(BASE+"/products/999999"),"{\"category_id\":1,\"name\":\"Valid\"}").andExpect(status().isNotFound());
        write(patch(BASE+"/products/999999/status"),"{\"status\":\"Active\"}").andExpect(status().isNotFound());
        mvc.perform(auth(delete(BASE+"/products/999999"))).andExpect(status().isNotFound());
        mvc.perform(auth(post(BASE+"/products")).contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
    }

    @ParameterizedTest @ValueSource(strings={"Active","Inactive"})
    void deleteEmptyProductKeepsAuditAndAllowsRecreatingName(String productStatus) throws Exception {
        int id=data(write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"Mistake\",\"status\":\""+productStatus+"\"}")
                .andExpect(status().isCreated())).get("id").asInt();
        mvc.perform(auth(delete(BASE+"/products/"+id))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id)).andExpect(jsonPath("$.message").value("Xóa sản phẩm thành công."));
        assertFalse(products.existsById(id)); assertEquals(2,audits.count());
        var deleted=audits.findAll().stream().filter(a -> a.getAction().equals("PRODUCT_DELETED")).findFirst().orElseThrow();
        assertNull(deleted.getNewValue()); assertEquals("Mistake",deleted.getOldValue().get("name"));
        mvc.perform(auth(delete(BASE+"/products/"+id))).andExpect(status().isNotFound());
        int recreated=data(write(post(BASE+"/products"),"{\"category_id\":1,\"name\":\"Mistake\"}")
                .andExpect(status().isCreated())).get("id").asInt();
        assertNotEquals(id,recreated);
    }

    @ParameterizedTest @ValueSource(ints={1,2,4,7})
    void deleteBlocksEveryVariantIncludingInactive(Integer id) throws Exception {
        mvc.perform(auth(delete(BASE+"/products/"+id))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PRODUCT_IN_USE"))
                .andExpect(jsonPath("$.error.message",containsString("Inactive")));
        assertTrue(products.existsById(id)); assertEquals(8,variants.count()); assertEquals(0,audits.count());
    }

    @Test void deleteBlocksOptionGroupEvenWithoutVariants() throws Exception {
        jdbc.update("INSERT INTO Product_Option_Groups(product_id,name,selection_type,is_required,min_select,max_select,sort_order) VALUES (6,'Empty group','Single',false,0,1,0)");
        mvc.perform(auth(delete(BASE+"/products/6"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PRODUCT_IN_USE"));
        assertTrue(products.existsById(6)); assertEquals(0,audits.count());
    }
}
