package com.smart_cafe_ai.catalog_service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.model.MenuStatus;
import com.smart_cafe_ai.catalog_service.model.Category;
import com.smart_cafe_ai.catalog_service.repository.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
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
import java.text.Normalizer;
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
class CategoryAdminApiTest {
    private static final String BASE = "/api/v1/catalog";
    static final String SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired CategoryRepository categories;
    @Autowired ProductRepository products;
    @Autowired AuditLogRepository audits;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;

    static String token(String role) {
        return "Bearer " + Jwts.builder().subject("manager-user").claim("role",role)
                .expiration(new Date(System.currentTimeMillis()+600000))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request) {
        return request.header("Authorization",token("Manager"));
    }

    @Test void allAdminRoutesAndAliasesRequireAuthenticationBeforeBodyBinding() throws Exception {
        for (String prefix : new String[]{BASE,"/catalog"}) {
            for (var request : List.of(get(prefix+"/admin/categories"),
                    post(prefix+"/categories").content("{"),
                    put(prefix+"/categories/1").content("{"),
                    patch(prefix+"/categories/1/status").content("{"),
                    delete(prefix+"/categories/4"))) {
                mvc.perform(request.contentType(MediaType.APPLICATION_JSON).header("X-Role","Admin"))
                        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
            }
        }
        assertEquals(4,categories.count());
        assertEquals(0,audits.count());
    }

    @ParameterizedTest @ValueSource(strings={"Customer","Staff","Cashier",""})
    void rejectsNonManagementRoles(String role) throws Exception {
        for (var request : List.of(get(BASE+"/admin/categories"),post(BASE+"/categories"),
                put(BASE+"/categories/1"),patch(BASE+"/categories/1/status"),delete(BASE+"/categories/4"))) {
            mvc.perform(request.header("Authorization",token(role)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        }
        assertEquals(0,audits.count());
    }

    @Test void rejectsForgedExpiredAndIncompleteTokens() throws Exception {
        var key=Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET));
        var wrongKey=Keys.hmacShaKeyFor(new byte[48]);
        var tokens=List.of("Bearer invalid",
                "Bearer "+Jwts.builder().subject("manager").claim("role","Admin")
                    .expiration(new Date(System.currentTimeMillis()+60000)).signWith(wrongKey).compact(),
                "Bearer "+Jwts.builder().subject("manager").claim("role","Admin")
                    .expiration(new Date(1)).signWith(key).compact(),
                "Bearer "+Jwts.builder().subject("manager").claim("role","Admin").signWith(key).compact(),
                "Bearer "+Jwts.builder().claim("role","Admin")
                    .expiration(new Date(System.currentTimeMillis()+60000)).signWith(key).compact());
        for(String token:tokens) mvc.perform(get(BASE+"/admin/categories").header("Authorization",token))
                .andExpect(status().isUnauthorized());
    }

    @ParameterizedTest @ValueSource(strings={"Manager","Admin"})
    void listsBothStatusesWithStablePaginationAndActiveProductCounts(String role) throws Exception {
        mvc.perform(get(BASE+"/admin/categories").header("Authorization",token(role)).param("size","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(3,1)))
                .andExpect(jsonPath("$.message").doesNotExist())
                .andExpect(jsonPath("$.data[*].product_count",contains(1,2)))
                .andExpect(jsonPath("$.data[*].total_product_count",contains(1,3)))
                .andExpect(jsonPath("$.data[*].active_product_count",contains(1,2)))
                .andExpect(jsonPath("$.meta.total").value(4)).andExpect(jsonPath("$.meta.total_pages").value(2));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("page","2").param("size","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(2,4)));
    }

    @Test void adminFiltersAndEmptyPagesAreCorrect() throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q"," COF ").param("status","Active"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1)))
                .andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("status","Inactive"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(3)));
        for (String q:new String[]{"%","_","' OR 1=1 --","missing"}) {
            mvc.perform(auth(get(BASE+"/admin/categories")).param("q",q))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty())
                    .andExpect(jsonPath("$.message").value("Không tìm thấy danh mục phù hợp. Bạn hãy thử thay đổi bộ lọc."))
                    .andExpect(jsonPath("$.meta.total").value(0));
        }
        mvc.perform(auth(get(BASE+"/admin/categories")).param("page","99"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty())
                .andExpect(jsonPath("$.message").value("Trang này chưa có danh mục. Bạn hãy chọn trang trước."))
                .andExpect(jsonPath("$.meta.total").value(4));
    }

    @ParameterizedTest
    @CsvSource({"page,0","size,101","size,-1","page,2147483647","status,Deleted","page,x"})
    void rejectsInvalidListParameters(String key,String value) throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")).param(key,value))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test @Sql("/catalog-cleanup.sql")
    void emptyDatabaseReturnsEmptyArrayAndZeroMeta() throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty())
                .andExpect(jsonPath("$.message").value("Chưa có danh mục nào. Bạn có thể tạo danh mục mới."))
                .andExpect(jsonPath("$.meta.page").value(1)).andExpect(jsonPath("$.meta.size").value(20))
                .andExpect(jsonPath("$.meta.total").value(0)).andExpect(jsonPath("$.meta.total_pages").value(0));
    }

    @Test void adminCountsAllProductsSeparatelyFromActiveProductsAndVariants() throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q","Coffee"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].total_product_count").value(3))
                .andExpect(jsonPath("$.data[0].active_product_count").value(2))
                .andExpect(jsonPath("$.data[0].product_count").value(2));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q","Empty"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].total_product_count").value(0))
                .andExpect(jsonPath("$.data[0].active_product_count").value(0));
        jdbc.update("INSERT INTO Products(category_id,name,status,caffeine_level,sort_order) VALUES (4,'Inactive only','Inactive','None',0)");
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q","Empty"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].total_product_count").value(1))
                .andExpect(jsonPath("$.data[0].active_product_count").value(0));
        mvc.perform(get(BASE+"/categories"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].total_product_count").doesNotExist());
    }

    @ParameterizedTest @ValueSource(strings={"ca phe","CÀ PHÊ","Cà phê","Ca\u0300 phe\u0302"})
    void searchesVietnameseWithOrWithoutAccentsAndCase(String q) throws Exception {
        var category=categories.saveAndFlush(new Category("Cà phê",null,1,MenuStatus.Active));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q",q))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(category.getId())));
    }

    @ParameterizedTest @ValueSource(strings={"do uong","DO UONG","ĐỒ UỐNG","Đồ uống"})
    void searchesStrokedDAndImportedDecomposedNames(String q) throws Exception {
        var category=categories.saveAndFlush(new Category(Normalizer.normalize("Đồ uống",Normalizer.Form.NFD),null,1,MenuStatus.Inactive));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q",q).param("status","Inactive"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(category.getId())))
                .andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("q",q).param("status","Active"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
    }

    @Test void sortWhitelistAndIdTieBreakerKeepPagesStable() throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")).param("sort","name"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1,4,3,2)));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("sort","id,desc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(4,3,2,1)));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("sort","status,desc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(3,1,2,4)));
        jdbc.update("UPDATE Categories SET sort_order=1");
        mvc.perform(auth(get(BASE+"/admin/categories")).param("sort","sort_order,desc").param("size","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1,2)));
        mvc.perform(auth(get(BASE+"/admin/categories")).param("sort","sort_order,desc").param("page","2").param("size","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(3,4)));
    }

    @ParameterizedTest @ValueSource(strings={"unknown","total_product_count","product_count","sortOrder",
            "name,up","name,asc,id","name,","name;drop table Categories","name,asc;--","id,desc,"})
    void invalidSortReturns400(String sort) throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")).param("sort",sort))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertEquals(4,categories.count());
    }

    @ParameterizedTest @CsvSource({"page,-1","size,0","size,x","size,1.5","page,1.5","page,2147483648","status,active"})
    void invalidPaginationAndStatusAreRejected(String key,String value) throws Exception {
        mvc.perform(auth(get(BASE+"/admin/categories")).param(key,value))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test void createNormalizesUnicodeSpacesUsesDefaultsAndRecordsAudit() throws Exception {
        String input=Normalizer.normalize("  Cà\u00a0phê   rang  ",Normalizer.Form.NFD);
        MvcResult result=mvc.perform(auth(post("/catalog/categories")).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name",input))))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.message").value("Tạo danh mục thành công."))
                .andExpect(jsonPath("$.data.name").value("Cà phê rang"))
                .andExpect(jsonPath("$.data.status").value("Active"))
                .andExpect(jsonPath("$.data.sort_order").value(0))
                .andExpect(jsonPath("$.data.image").value(nullValue()))
                .andExpect(jsonPath("$.data.product_count").value(0)).andReturn();
        int id=json.readTree(result.getResponse().getContentAsString()).path("data").path("id").asInt();
        em.flush(); em.clear();
        var audit=audits.findAll().get(0);
        assertEquals("manager-user",audit.getActorUserId());
        assertEquals("CATEGORY_CREATED",audit.getAction());
        assertEquals(String.valueOf(id),audit.getEntityId());
        assertNull(audit.getOldValue());
        assertEquals("Cà phê rang",audit.getNewValue().get("name"));
        assertNotNull(audit.getIpAddress());
        assertNotNull(audit.getCreatedAt());
        mvc.perform(get(BASE+"/categories")).andExpect(jsonPath("$.data[*].id",hasItem(id)));
    }

    @Test void createInactiveCategoryWithImageAndSortOrder() throws Exception {
        mvc.perform(auth(post(BASE+"/categories")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Bakery\",\"image\":\"https://example.com/bakery.png\",\"sort_order\":7,\"status\":\"Inactive\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.status").value("Inactive"))
                .andExpect(jsonPath("$.data.image").value("https://example.com/bakery.png"))
                .andExpect(jsonPath("$.data.sort_order").value(7));
        mvc.perform(get(BASE+"/categories")).andExpect(jsonPath("$.data[*].name",not(hasItem("Bakery"))));
    }

    @ParameterizedTest @ValueSource(strings={"Coffee"," coffee ","COFFEE","Hidden"})
    void duplicateNameIncludesInactiveCategories(String name) throws Exception {
        mvc.perform(auth(post(BASE+"/categories")).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name",name))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("CATEGORY_NAME_EXISTS"));
        assertEquals(4,categories.count()); assertEquals(0,audits.count());
    }

    static Stream<String> invalidBodies() {
        return Stream.of("{}","null","{\"name\":null}","{\"name\":\"\"}","{\"name\":\"   \"}",
                "{\"name\":123}","{\"name\":true}","{\"name\":[]}",
                "{\"name\":\"Test\",\"sort_order\":-1}","{\"name\":\"Test\",\"sort_order\":1.5}",
                "{\"name\":\"Test\",\"sort_order\":\"1\"}","{\"name\":\"Test\",\"sort_order\":null}",
                "{\"name\":\"Test\",\"sort_order\":2147483648}",
                "{\"name\":\"Test\",\"status\":0}","{\"name\":\"Test\",\"status\":null}",
                "{\"name\":\"Test\",\"status\":\"active\"}","{\"name\":\"Test\",\"image\":12}",
                "{\"name\":\"Test\",\"image\":\"javascript:alert(1)\"}",
                "{\"name\":\"Test\",\"image\":\"https://user:pass@example.com/x\"}",
                "{\"name\":\"Test\",\"sortOrder\":1}",
                "{\"name\":\"Test\\nName\"}","{\"name\":\"Hidden\\u200bName\"}",
                "{\"name\":\"Bad\\uD800Name\"}","{\"name\":\"Bad\\uDC00Name\"}",
                "{\"name\":\""+ "x".repeat(101)+"\"}",
                "{\"name\":\"Test\",\"image\":\"https://example.com/"+"x".repeat(256)+"\"}");
    }

    @ParameterizedTest @MethodSource("invalidBodies")
    void invalidCreateAndPutDoNotWrite(String body) throws Exception {
        for(var request:List.of(post(BASE+"/categories"),put(BASE+"/categories/1"))) {
            mvc.perform(auth(request).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        }
        assertEquals(4,categories.count()); assertEquals("Coffee",categories.findById(1).orElseThrow().getName());
        assertEquals(0,audits.count());
    }

    @Test void rejectsMissingAndMalformedBodies() throws Exception {
        for(String body:new String[]{"","{","[]"}) {
            for(var request:List.of(post(BASE+"/categories"),put(BASE+"/categories/1"),patch(BASE+"/categories/1/status"))) {
                mvc.perform(auth(request).contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isBadRequest());
            }
        }
    }

    @Test void validationMessagesIdentifyTheFieldAndDoNotExposeFrameworkErrors() throws Exception {
        Map<String,String> bodies = Map.of(
                "{\"name\":123}","Tên danh mục",
                "{\"name\":\"Test\",\"image\":12}","Đường dẫn ảnh",
                "{\"name\":\"Test\",\"sort_order\":1.5}","Thứ tự hiển thị",
                "{\"name\":\"Test\",\"sort_order\":null}","Thứ tự hiển thị",
                "{\"name\":\"Test\",\"sort_order\":2147483648}","Thứ tự hiển thị",
                "{\"name\":\"Test\",\"status\":0}","Trạng thái danh mục",
                "{\"name\":\"Test\",\"status\":null}","Trạng thái danh mục");
        for(var entry:bodies.entrySet()) {
            mvc.perform(auth(post(BASE+"/categories")).contentType(MediaType.APPLICATION_JSON).content(entry.getKey()))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                    .andExpect(jsonPath("$.error.message",containsString(entry.getValue())))
                    .andExpect(jsonPath("$.error.message",not(containsString("com.fasterxml"))))
                    .andExpect(jsonPath("$.message").doesNotExist());
        }
        mvc.perform(auth(get(BASE+"/admin/categories")).param("page","abc"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.message",containsString("Số trang")));
        mvc.perform(auth(patch(BASE+"/categories/0/status")).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"Active\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.message",containsString("Mã danh mục")));
        mvc.perform(auth(patch(BASE+"/categories/1/status")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"Active\",\"name\":\"Other\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.message",containsString("trạng thái danh mục")));
        assertEquals(0,audits.count());
    }

    @Test void unsupportedContentTypeReturns415() throws Exception {
        for(var request:List.of(post(BASE+"/categories"),put(BASE+"/categories/1"),patch(BASE+"/categories/1/status"))) {
            mvc.perform(auth(request).contentType(MediaType.TEXT_PLAIN).content("{}"))
                    .andExpect(status().isUnsupportedMediaType())
                    .andExpect(jsonPath("$.error.code").value("UNSUPPORTED_MEDIA_TYPE"));
        }
    }

    @Test void putReplacesFieldsAndDoesNotChangeProductStatuses() throws Exception {
        mvc.perform(auth(put(BASE+"/categories/1")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Coffee renamed\",\"image\":\"https://example.com/new.png\",\"sort_order\":5,\"status\":\"Inactive\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("Coffee renamed"))
                .andExpect(jsonPath("$.message").value("Cập nhật danh mục thành công."))
                .andExpect(jsonPath("$.data.sort_order").value(5)).andExpect(jsonPath("$.data.product_count").value(2));
        assertEquals(MenuStatus.Active,products.findById(1).orElseThrow().getStatus());
        assertEquals(MenuStatus.Inactive,products.findById(4).orElseThrow().getStatus());
        assertEquals("Coffee",audits.findAll().get(0).getOldValue().get("name"));
        mvc.perform(auth(put(BASE+"/categories/1")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Coffee renamed\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("Active"))
                .andExpect(jsonPath("$.data.sort_order").value(0)).andExpect(jsonPath("$.data.image").value(nullValue()));
    }

    @Test void putAllowsOwnNameButConflictsWithAnotherName() throws Exception {
        mvc.perform(auth(put(BASE+"/categories/1")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"COFFEE\",\"sort_order\":1}"))
                .andExpect(status().isOk());
        mvc.perform(auth(put(BASE+"/categories/1")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" hidden \"}"))
                .andExpect(status().isConflict());
        assertEquals("COFFEE",categories.findById(1).orElseThrow().getName());
    }

    @Test void patchIsIdempotentAndHidesAndRestoresOnlyActiveProducts() throws Exception {
        for(int i=0;i<2;i++) {
            mvc.perform(auth(patch(BASE+"/categories/1/status")).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"Inactive\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(1))
                    .andExpect(jsonPath("$.message").value(i == 0
                            ? "Đã ngừng hiển thị danh mục và các sản phẩm thuộc danh mục trên thực đơn."
                            : "Danh mục đã ở trạng thái ngừng hiển thị."))
                    .andExpect(jsonPath("$.data.status").value("Inactive"));
        }
        assertEquals(1,audits.count());
        mvc.perform(get(BASE+"/categories")).andExpect(jsonPath("$.data[*].id",not(hasItem(1))));
        mvc.perform(get(BASE+"/products").param("category_id","1")).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get(BASE+"/products/1")).andExpect(status().isNotFound());
        mvc.perform(auth(patch(BASE+"/categories/1/status")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"Active\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Kích hoạt danh mục thành công."));
        mvc.perform(get(BASE+"/products").param("category_id","1"))
                .andExpect(jsonPath("$.data[*].id",contains(1,2)));
        mvc.perform(get(BASE+"/products/4")).andExpect(status().isNotFound());
        assertEquals(2,audits.count());
        assertEquals("CATEGORY_STATUS_CHANGED",audits.findAll().get(0).getAction());
    }

    @Test void putIdenticalRepresentationDoesNotWriteAudit() throws Exception {
        for(int i=0;i<2;i++) mvc.perform(auth(put(BASE+"/categories/1")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Coffee\",\"image\":null,\"sort_order\":1,\"status\":\"Active\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Thông tin danh mục không thay đổi."));
        assertEquals(0,audits.count());
    }

    @ParameterizedTest @ValueSource(strings={"{}","null","{\"status\":null}","{\"status\":0}",
            "{\"status\":\"Deleted\"}","{\"status\":\"active\"}","{\"status\":\"Inactive\",\"name\":\"Hacked\"}"})
    void rejectsInvalidPatchBody(String body) throws Exception {
        mvc.perform(auth(patch(BASE+"/categories/1/status")).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        assertEquals(MenuStatus.Active,categories.findById(1).orElseThrow().getStatus());
        assertEquals(0,audits.count());
    }

    @Test void validatesIdsAndReportsMissingCategories() throws Exception {
        for(String id:List.of("0","-1","x","999")) {
            int expected=id.equals("999")?404:400;
            mvc.perform(auth(put(BASE+"/categories/"+id)).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Replacement\"}")).andExpect(status().is(expected));
            mvc.perform(auth(patch(BASE+"/categories/"+id+"/status")).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"Inactive\"}")).andExpect(status().is(expected));
            mvc.perform(auth(delete(BASE+"/categories/"+id))).andExpect(status().is(expected));
        }
    }

    @ParameterizedTest @ValueSource(strings={"Manager","Admin"})
    void deleteEmptyCategoryPermanentlyAndKeepDeletionAudit(String role) throws Exception {
        long productCount=products.count();
        mvc.perform(delete("/catalog/categories/4").header("Authorization",token(role)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(4))
                .andExpect(jsonPath("$.message").value("Xóa danh mục thành công."))
                .andExpect(jsonPath("$.trace_id").isNotEmpty());
        em.flush(); em.clear();
        assertFalse(categories.existsById(4));
        assertEquals(productCount,products.count());
        var audit=audits.findAll().get(0);
        assertEquals("CATEGORY_DELETED",audit.getAction());
        assertEquals("4",audit.getEntityId());
        assertEquals("manager-user",audit.getActorUserId());
        assertEquals("Empty",audit.getOldValue().get("name"));
        assertEquals("Active",audit.getOldValue().get("status"));
        assertNull(audit.getNewValue());
        mvc.perform(auth(get(BASE+"/admin/categories"))).andExpect(jsonPath("$.data[*].id",not(hasItem(4))));
        mvc.perform(get(BASE+"/categories")).andExpect(jsonPath("$.data[*].id",not(hasItem(4))));
        mvc.perform(auth(delete(BASE+"/categories/4"))).andExpect(status().isNotFound());
        assertEquals(1,audits.count());
    }

    @Test void deleteEmptyInactiveCategoryPreservesEarlierHistoryAndAllowsNameReuse() throws Exception {
        var result=mvc.perform(auth(post(BASE+"/categories")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Created by mistake\",\"status\":\"Inactive\"}"))
                .andExpect(status().isCreated()).andReturn();
        int id=json.readTree(result.getResponse().getContentAsString()).path("data").path("id").asInt();
        mvc.perform(auth(delete(BASE+"/categories/"+id))).andExpect(status().isOk());
        em.flush(); em.clear();
        assertFalse(categories.existsById(id));
        assertEquals(2,audits.count());
        assertEquals(Set.of("CATEGORY_CREATED","CATEGORY_DELETED"),
                audits.findAll().stream().map(a -> a.getAction()).collect(java.util.stream.Collectors.toSet()));
        assertTrue(audits.findAll().stream().allMatch(a -> a.getEntityId().equals(String.valueOf(id))));
        mvc.perform(auth(post(BASE+"/categories")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Created by mistake\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.id",not(is(id))));
    }

    @ParameterizedTest @ValueSource(ints={1,2,3})
    void categoriesWithProductsCannotBeDeletedEvenIfCategoryIsInactive(int id) throws Exception {
        MenuStatus original=categories.findById(id).orElseThrow().getStatus();
        long count=products.count();
        mvc.perform(auth(delete(BASE+"/categories/"+id)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("CATEGORY_IN_USE"))
                .andExpect(jsonPath("$.error.message",containsString("Không thể xóa danh mục")))
                .andExpect(jsonPath("$.error.message",containsString("Inactive")));
        assertEquals(original,categories.findById(id).orElseThrow().getStatus());
        assertEquals(count,products.count());
        assertEquals(0,audits.count());
    }

    @Test void categoryWithOnlyInactiveProductsCannotBeDeleted() throws Exception {
        jdbc.update("INSERT INTO Products(category_id,name,status,caffeine_level,sort_order) VALUES (4,'Retired product','Inactive','None',0)");
        mvc.perform(auth(delete(BASE+"/categories/4")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("CATEGORY_IN_USE"))
                .andExpect(jsonPath("$.error.message",containsString("kể cả sản phẩm đã ngừng bán")));
        assertTrue(categories.existsById(4));
        assertEquals(MenuStatus.Active,categories.findById(4).orElseThrow().getStatus());
        assertEquals(8,products.count());
        assertEquals(0,audits.count());
    }
}

