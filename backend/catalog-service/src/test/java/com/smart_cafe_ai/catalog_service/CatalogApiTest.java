package com.smart_cafe_ai.catalog_service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.util.Date;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@Sql("/catalog-fixture.sql")
class CatalogApiTest {
    private static final String BASE = "/api/v1/catalog";
    private static final String SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
    @Autowired MockMvc mvc;

    @Test void categoriesArePublicOrderedAndCountOnlyActiveProducts() throws Exception {
        mvc.perform(get(BASE + "/categories"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.trace_id").isNotEmpty())
                .andExpect(jsonPath("$.data[*].id", contains(1,2,4)))
                .andExpect(jsonPath("$.data[*].product_count", contains(2,3,0)));
    }

    @Test void inactiveCategoriesRequireVerifiedManagerOrAdmin() throws Exception {
        mvc.perform(get(BASE + "/categories").param("status","Inactive"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
        mvc.perform(get(BASE + "/categories").param("status","Inactive").header("X-Role","Admin"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(BASE + "/categories").param("status","Inactive").header("Authorization","Bearer forged"))
                .andExpect(status().isUnauthorized());
        for (String role : new String[]{"Customer","Staff",""}) {
            mvc.perform(get(BASE + "/categories").param("status","Inactive").header("Authorization",token(role,60000)))
                    .andExpect(status().isForbidden());
        }
        for (String role : new String[]{"Manager","Admin"}) {
            mvc.perform(get(BASE + "/categories").param("status","Inactive").header("Authorization",token(role,60000)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(3)))
                    .andExpect(jsonPath("$.data[0].product_count").value(1));
        }
        mvc.perform(get(BASE + "/categories").param("status","Inactive").header("Authorization",token("Admin",-60000)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("TOKEN_EXPIRED"));
    }

    @Test void productsUseActiveVariantPriceAndStablePagination() throws Exception {
        mvc.perform(get(BASE + "/products").param("size","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1,3)))
                .andExpect(jsonPath("$.data[0].price").value(40000))
                .andExpect(jsonPath("$.data[0].max_price").value(50000))
                .andExpect(jsonPath("$.data[0].flavor_tags",contains("creamy","sweet")))
                .andExpect(jsonPath("$.data[0].is_available").value(true))
                .andExpect(jsonPath("$.meta.page").value(1)).andExpect(jsonPath("$.meta.size").value(2))
                .andExpect(jsonPath("$.meta.total").value(5)).andExpect(jsonPath("$.meta.total_pages").value(3));
        mvc.perform(get(BASE + "/products").param("page","2").param("size","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(2,6)));
    }

    @Test void combinesAllFiltersAndSortsByDisplayPrice() throws Exception {
        mvc.perform(get(BASE + "/products").param("q"," LAT ").param("category_id","1")
                        .param("temperature","Hot_Or_Iced").param("caffeine_level","Medium")
                        .param("flavor_tag"," CREAMY ").param("min_price","35000").param("max_price","45000")
                        .param("sort","price,desc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1)))
                .andExpect(jsonPath("$.meta.total").value(1));
        mvc.perform(get(BASE + "/products").param("max_price","60000").param("sort","price,desc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(3,1,2)));
        mvc.perform(get(BASE + "/products").param("sort","name,desc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").value(7));
    }

    @Test void flavorMembershipIsExactAndSearchWildcardsAreLiteral() throws Exception {
        mvc.perform(get(BASE + "/products").param("flavor_tag","cream"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get(BASE + "/products").param("flavor_tag","creamy"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1,3)));
        for (String q : new String[]{"%","_","' OR 1=1 --"}) {
            mvc.perform(get(BASE + "/products").param("q",q))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        }
    }

    @Test void listUsesRequestedBranchAndKeepsUnavailableProductsVisible() throws Exception {
        mvc.perform(get(BASE + "/products").param("category_id","1").param("branch_id","10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].id",contains(1,2)))
                .andExpect(jsonPath("$.data[0].is_available").value(true))
                .andExpect(jsonPath("$.data[1].is_available").value(false));
        mvc.perform(get(BASE + "/products").param("category_id","1").param("branch_id","20"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[*].is_available",contains(false,true)));
    }

    @Test void detailContainsOnlyActiveVariantsAndOptionsAndBranchOverrides() throws Exception {
        mvc.perform(get(BASE + "/products/1").param("branch_id","10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.category_id").value(1))
                .andExpect(jsonPath("$.data.variants[*].id",contains(11,12)))
                .andExpect(jsonPath("$.data.variants[*].is_available",contains(false,true)))
                .andExpect(jsonPath("$.data.variants[0].unavailable_reason").value("Size M sold out"))
                .andExpect(jsonPath("$.data.option_groups[*].id",contains(101,102)))
                .andExpect(jsonPath("$.data.option_groups[0].is_required").value(true))
                .andExpect(jsonPath("$.data.option_groups[0].min_select").value(1))
                .andExpect(jsonPath("$.data.option_groups[0].max_select").value(1))
                .andExpect(jsonPath("$.data.option_groups[0].options[*].is_available",contains(true,true)))
                .andExpect(jsonPath("$.data.option_groups[1].options[*].id",contains(1003)))
                .andExpect(jsonPath("$.data.option_groups[1].options[0].is_available").value(false))
                .andExpect(jsonPath("$.data.option_groups[1].options[0].unavailable_reason").value("No pearls"));
    }

    @Test void availabilityDefaultsToTrueAndIsIsolatedBetweenBranches() throws Exception {
        for (String path : new String[]{BASE + "/products/1","/catalog/products/1"}) {
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.variants[*].is_available",contains(true,true)))
                    .andExpect(jsonPath("$.data.option_groups[1].options[0].is_available").value(true));
        }
        mvc.perform(get(BASE + "/products/1").param("branch_id","20"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.is_available").value(false))
                .andExpect(jsonPath("$.data.variants[*].is_available",contains(false,false)))
                .andExpect(jsonPath("$.data.option_groups[1].options[0].is_available").value(true));
        mvc.perform(get(BASE + "/products/1").param("branch_id","999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.is_available").value(true));
    }

    @ParameterizedTest @ValueSource(ints = {6,7})
    void productsWithoutActiveVariantsHaveNullPricesAndAreUnavailable(int id) throws Exception {
        mvc.perform(get(BASE + "/products/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.price").value(nullValue()))
                .andExpect(jsonPath("$.data.max_price").value(nullValue()))
                .andExpect(jsonPath("$.data.is_available").value(false))
                .andExpect(jsonPath("$.data.variants").isEmpty())
                .andExpect(jsonPath("$.data.option_groups").isEmpty());
    }

    @ParameterizedTest @ValueSource(ints = {4,5,999})
    void hidesInactiveAndUnknownProducts(int id) throws Exception {
        mvc.perform(get(BASE + "/products/" + id)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false)).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test void emptyResultsStillIncludePagination() throws Exception {
        mvc.perform(get(BASE + "/products").param("category_id","999")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty()).andExpect(jsonPath("$.meta.total").value(0));
        mvc.perform(get(BASE + "/products").param("page","100")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty()).andExpect(jsonPath("$.meta.total").value(5));
    }

    @ParameterizedTest
    @CsvSource({"page,0","page,-1","page,abc","page,2147483647","size,0","size,101","category_id,-1","category_id,x",
            "branch_id,0","temperature,Cold","caffeine_level,Extreme","min_price,-1","max_price,1.5",
            "min_price,1000000000000000","sort,unknown"})
    void rejectsInvalidQueryParameters(String name, String value) throws Exception {
        mvc.perform(get(BASE + "/products").param(name,value)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test void rejectsInvalidRangesSortsStatusAndPaths() throws Exception {
        mvc.perform(get(BASE + "/products").param("min_price","50000").param("max_price","40000"))
                .andExpect(status().isBadRequest());
        for (String value : new String[]{"price,invalid","price,asc,desc","price,","name);drop table Products"}) {
            mvc.perform(get(BASE + "/products").param("sort",value)).andExpect(status().isBadRequest());
        }
        mvc.perform(get(BASE + "/categories").param("status","Deleted")).andExpect(status().isBadRequest());
        for (String id : new String[]{"0","-1","abc"}) {
            mvc.perform(get(BASE + "/products/" + id)).andExpect(status().isBadRequest());
        }
        mvc.perform(get(BASE + "/products/1").param("branch_id","0")).andExpect(status().isBadRequest());
    }

    private String token(String role, long expiresIn) {
        return "Bearer " + Jwts.builder().subject("test-user").claim("role",role)
                .expiration(new Date(System.currentTimeMillis()+expiresIn))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();
    }
}

