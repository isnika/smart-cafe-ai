package com.smart_cafe_ai.catalog_service.controller;

import com.smart_cafe_ai.catalog_service.dto.*;
import com.smart_cafe_ai.catalog_service.dto.config.*;
import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.security.*;
import com.smart_cafe_ai.catalog_service.service.CatalogConfigurationService;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController @RequestMapping({"/catalog","/api/v1/catalog"}) @ManagerOnly @RequiredArgsConstructor
public class CatalogConfigurationController {
    private final CatalogConfigurationService service;
    @PostMapping("/products/{productId}/variants") @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ConfigResponse.Variant> createVariant(@PathVariable @Positive Integer productId,@RequestBody VariantCreateRequest body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.createVariant(productId,body,actor);}
    @PutMapping("/variants/{id}")
    public ApiResponse<ConfigResponse.Variant> updateVariant(@PathVariable @Positive Integer id,@RequestBody ConfigRequests.VariantUpdate body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.updateVariant(id,body,actor);}
    @PatchMapping("/variants/{id}/status")
    public ApiResponse<ConfigResponse.Status> variantStatus(@PathVariable @Positive Integer id,@RequestBody ConfigRequests.Status body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.variantStatus(id,body.status(),actor);}
    @PatchMapping("/variants/{id}/price")
    public ApiResponse<ConfigResponse.Price> price(@PathVariable @Positive Integer id,@RequestBody ConfigRequests.Price body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.price(id,body,actor);}
    @GetMapping("/variants/{id}/price-history")
    public ApiResponse<List<ConfigResponse.History>> history(@PathVariable @Positive Integer id,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {return service.history(id,page,size);}
    @PostMapping("/products/{productId}/option-groups") @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ConfigResponse.Group> createGroup(@PathVariable @Positive Integer productId,@RequestBody ConfigRequests.Group body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.createGroup(productId,body,actor);}
    @PutMapping("/option-groups/{id}")
    public ApiResponse<ConfigResponse.Group> updateGroup(@PathVariable @Positive Integer id,@RequestBody ConfigRequests.Group body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.updateGroup(id,body,actor);}
    @PostMapping("/option-groups/{groupId}/options") @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ConfigResponse.Option> createOption(@PathVariable @Positive Integer groupId,@RequestBody OptionCreateRequest body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.createOption(groupId,body,actor);}
    @PutMapping("/options/{id}")
    public ApiResponse<ConfigResponse.Option> updateOption(@PathVariable @Positive Integer id,@RequestBody OptionCreateRequest body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.updateOption(id,body,actor);}
    @PatchMapping("/options/{id}/status")
    public ApiResponse<ConfigResponse.Status> optionStatus(@PathVariable @Positive Integer id,@RequestBody ConfigRequests.Status body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.optionStatus(id,body.status(),actor);}
    @PutMapping("/branches/{branchId}/variants/{variantId}/availability")
    public ApiResponse<ConfigResponse.VariantAvailability> variantAvailability(@PathVariable @Positive Integer branchId,@PathVariable @Positive Integer variantId,@RequestBody ConfigRequests.Availability body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.variantAvailability(branchId,variantId,body,actor);}
    @PutMapping("/branches/{branchId}/options/{optionId}/availability")
    public ApiResponse<ConfigResponse.OptionAvailability> optionAvailability(@PathVariable @Positive Integer branchId,@PathVariable @Positive Integer optionId,@RequestBody ConfigRequests.Availability body,@RequestAttribute(CatalogActor.ATTRIBUTE) CatalogActor actor) {return service.optionAvailability(branchId,optionId,body,actor);}
}
