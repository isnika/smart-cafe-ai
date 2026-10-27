package com.smart_cafe_ai.catalog_service.service;

import com.smart_cafe_ai.catalog_service.dto.config.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.smart_cafe_ai.catalog_service.validation.ProductValidation.invalid;
import static org.springframework.http.HttpStatus.*;

@Service @RequiredArgsConstructor @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class CatalogResolveService {
    private final ProductVariantRepository variants;
    private final ProductRepository products;
    private final ProductOptionGroupRepository groups;
    private final ProductOptionRepository options;
    private final BranchProductAvailabilityRepository branchVariants;
    private final BranchOptionAvailabilityRepository branchOptions;
    private final com.smart_cafe_ai.catalog_service.integration.StoreBranchVerifier store;

    public ResolveResponse resolve(ResolveRequest request) {
        if(request==null || request.getBranchId()==null || request.getBranchId()<=0 || request.getItems()==null || request.getItems().isEmpty() || request.getItems().size()>100)
            invalid("Vui lòng gửi branch_id dương và từ 1 đến 100 dòng sản phẩm.");
        Set<Integer> variantIds=new HashSet<>(),optionIds=new HashSet<>();
        for(var item:request.getItems()) {
            if(item.getVariantId()==null || item.getVariantId()<=0 || item.getOptions().size()>100) invalid("Mã biến thể phải dương và mỗi dòng có tối đa 100 tùy chọn.");
            variantIds.add(item.getVariantId()); Set<Integer> seen=new HashSet<>();
            for(var option:item.getOptions()) {
                if(option.getOptionId()==null || option.getOptionId()<=0 || option.getQuantity()==null || option.getQuantity()<1 || !seen.add(option.getOptionId()))
                    invalid("Mã tùy chọn và số lượng phải dương; không gửi trùng tùy chọn trong một dòng.");
                optionIds.add(option.getOptionId());
            }
        }
        store.requireExists(request.getBranchId());
        var variantMap=variants.findByIdIn(variantIds).stream().collect(Collectors.toMap(ProductVariant::getId,Function.identity()));
        Set<Integer> productIds=variantMap.values().stream().map(ProductVariant::getProductId).collect(Collectors.toSet());
        var productMap=products.findAllById(productIds).stream().collect(Collectors.toMap(Product::getId,Function.identity()));
        var groupRows=productIds.isEmpty()?List.<ProductOptionGroup>of():groups.findByProductIdIn(productIds);
        var groupMap=groupRows.stream().collect(Collectors.toMap(ProductOptionGroup::getId,Function.identity()));
        var groupsByProduct=groupRows.stream().collect(Collectors.groupingBy(ProductOptionGroup::getProductId));
        var optionMap=optionIds.isEmpty()?Map.<Integer,ProductOption>of():options.findByIdIn(optionIds).stream().collect(Collectors.toMap(ProductOption::getId,Function.identity()));
        var variantAvailability=branchVariants.findByBranchIdAndVariantIdIn(request.getBranchId(),variantIds).stream()
                .collect(Collectors.toMap(BranchProductAvailability::getVariantId,BranchProductAvailability::isAvailable));
        var optionAvailability=optionIds.isEmpty()?Map.<Integer,Boolean>of():branchOptions.findByBranchIdAndOptionIdIn(request.getBranchId(),optionIds).stream()
                .collect(Collectors.toMap(BranchOptionAvailability::getOptionId,BranchOptionAvailability::isAvailable));
        var result=new ArrayList<ResolveResponse.Item>();
        for(var item:request.getItems()) {
            var variant=variantMap.get(item.getVariantId()); if(variant==null) throw missing("Biến thể",item.getVariantId());
            var product=productMap.get(variant.getProductId()); if(product==null) throw missing("Sản phẩm",variant.getProductId());
            if(variant.getStatus()!=MenuStatus.Active || product.getStatus()!=MenuStatus.Active || product.getCategory().getStatus()!=MenuStatus.Active)
                rule("Sản phẩm, danh mục hoặc biến thể đã ngừng bán.");
            if(!variantAvailability.getOrDefault(variant.getId(),true)) stock("Biến thể hiện không khả dụng tại chi nhánh đã chọn.");
            Map<Integer,Long> selected=new HashMap<>(); var resolvedOptions=new ArrayList<ResolveResponse.Option>();
            for(var selectedOption:item.getOptions()) {
                var option=optionMap.get(selectedOption.getOptionId()); if(option==null) throw missing("Tùy chọn",selectedOption.getOptionId());
                var group=groupMap.get(option.getGroupId());
                if(group==null || !group.getProductId().equals(product.getId())) rule("Tùy chọn không thuộc sản phẩm đã chọn.");
                if(option.getStatus()!=MenuStatus.Active) rule("Tùy chọn đã ngừng bán.");
                if(!optionAvailability.getOrDefault(option.getId(),true)) stock("Tùy chọn hiện không khả dụng tại chi nhánh đã chọn.");
                selected.merge(group.getId(),selectedOption.getQuantity().longValue(),Long::sum);
                resolvedOptions.add(new ResolveResponse.Option(option.getId(),option.getOptionName(),option.getExtraPrice(),option.getStatus(),true,selectedOption.getQuantity()));
            }
            for(var group:groupsByProduct.getOrDefault(product.getId(),List.of())) {
                long count=selected.getOrDefault(group.getId(),0L);
                if(count>group.getMaxSelect() || (count<group.getMinSelect() && (group.isRequired() || count>0)))
                    rule("Số lựa chọn của nhóm '"+group.getName()+"' chưa đáp ứng min_select/max_select.");
            }
            result.add(new ResolveResponse.Item(variant.getId(),product.getId(),product.getName(),variant.getVariantName(),variant.getPrice(),variant.getStatus(),true,resolvedOptions));
        }
        return new ResolveResponse(List.copyOf(result));
    }
    private ApiException missing(String name,Integer id){return new ApiException(NOT_FOUND,"NOT_FOUND",name+" "+id+" không tồn tại.");}
    private void rule(String message){throw new ApiException(UNPROCESSABLE_ENTITY,"BUSINESS_RULE_VIOLATION",message);}
    private void stock(String message){throw new ApiException(UNPROCESSABLE_ENTITY,"OUT_OF_STOCK",message);}
}
