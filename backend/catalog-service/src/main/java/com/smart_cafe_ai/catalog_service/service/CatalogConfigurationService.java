package com.smart_cafe_ai.catalog_service.service;

import com.smart_cafe_ai.catalog_service.dto.*;
import com.smart_cafe_ai.catalog_service.dto.config.*;
import com.smart_cafe_ai.catalog_service.dto.product.*;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import com.smart_cafe_ai.catalog_service.model.*;
import com.smart_cafe_ai.catalog_service.repository.*;
import com.smart_cafe_ai.catalog_service.security.CatalogActor;
import com.smart_cafe_ai.catalog_service.validation.ProductValidation;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.data.domain.*;
import java.util.*;
import java.util.function.Supplier;
import static com.smart_cafe_ai.catalog_service.validation.ProductValidation.*;
import static org.springframework.http.HttpStatus.*;

@Service @RequiredArgsConstructor @Transactional(readOnly=true)
public class CatalogConfigurationService {
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final ProductOptionGroupRepository groups;
    private final ProductOptionRepository options;
    private final VariantPriceHistoryRepository histories;
    private final BranchProductAvailabilityRepository branchVariants;
    private final BranchOptionAvailabilityRepository branchOptions;
    private final AuditLogRepository audits;
    private final OutboxEventRepository outbox;
    private final com.smart_cafe_ai.catalog_service.integration.StoreBranchVerifier store;

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Variant> createVariant(Integer productId,VariantCreateRequest request,CatalogActor actor) {
        lockProduct(productId);
        String name=requiredName(request.getVariantName(),"Tên biến thể",50);
        var price=money(request.getPrice()); int order=order(request.getSortOrder()); requireStatus(request.getStatus());
        if(variants.existsByProductIdAndVariantNameIgnoreCaseAndIdNot(productId,name,-1)) duplicate("Tên biến thể đã có trong sản phẩm này.");
        var row=variants.saveAndFlush(new ProductVariant(productId,name,price,order,request.getStatus()));
        audit(actor,"VARIANT_CREATED","Variant",row.getId(),null,variant(row));
        return ApiResponse.success(variant(row),"Thêm biến thể thành công.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Variant> updateVariant(Integer id,ConfigRequests.VariantUpdate request,CatalogActor actor) {
        var row=lockVariant(id); var before=variant(row);
        String name=requiredName(request.getVariantName(),"Tên biến thể",50);
        requireStatus(request.getStatus()); int order=order(request.getSortOrder());
        if(variants.existsByProductIdAndVariantNameIgnoreCaseAndIdNot(row.getProductId(),name,id)) duplicate("Tên biến thể đã có trong sản phẩm này.");
        row.replace(name,order,request.getStatus()); var after=variant(row);
        if(!before.equals(after)) {variants.flush();audit(actor,"VARIANT_UPDATED","Variant",id,before,after);}
        return ApiResponse.success(after,before.equals(after)?"Thông tin biến thể không thay đổi.":"Cập nhật biến thể thành công.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Status> variantStatus(Integer id,MenuStatus status,CatalogActor actor) {
        requireStatus(status); var row=lockVariant(id); var before=variant(row);
        if(row.getStatus()!=status) {row.changeStatus(status);variants.flush();audit(actor,"VARIANT_STATUS_CHANGED","Variant",id,before,variant(row));}
        return ApiResponse.success(new ConfigResponse.Status(id,row.getStatus()),"Đã cập nhật trạng thái biến thể.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Price> price(Integer id,ConfigRequests.Price request,CatalogActor actor) {
        var price=money(request.price()); var row=lockVariant(id);
        if(row.getPrice().compareTo(price)==0) return ApiResponse.success(new ConfigResponse.Price(id,row.getPrice()),"Giá biến thể không thay đổi.");
        var before=variant(row); var oldPrice=row.getPrice();
        row.changePrice(price); variants.flush();
        histories.save(new VariantPriceHistory(id,oldPrice,price,actor.userId()));
        outbox.save(OutboxEvent.variantPriceChanged(row,oldPrice));
        audit(actor,"VARIANT_PRICE_CHANGED","Variant",id,before,variant(row));
        return ApiResponse.success(new ConfigResponse.Price(id,price),"Cập nhật giá biến thể thành công.");
    }
    public ApiResponse<List<ConfigResponse.History>> history(Integer id,int page,int size) {
        if(!variants.existsById(id)) throw missing("Biến thể");
        if(page<1 || size<1 || size>100 || (long)(page-1)*size>Integer.MAX_VALUE) invalid("Trang phải từ 1 và số mục mỗi trang từ 1 đến 100.");
        var result=histories.findByVariantId(id,PageRequest.of(page-1,size,Sort.by(Sort.Direction.DESC,"changedAt","id")));
        return ApiResponse.success(result.stream().map(h->new ConfigResponse.History(h.getId(),h.getVariantId(),h.getOldPrice(),h.getNewPrice(),h.getChangedBy(),h.getChangedAt())).toList(),
                new ApiResponse.PageMeta(page,size,result.getTotalElements(),result.getTotalPages()));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Group> createGroup(Integer productId,ConfigRequests.Group request,CatalogActor actor) {
        lockProduct(productId); var fields=groupFields(request);
        if(groups.existsByProductIdAndNameIgnoreCaseAndIdNot(productId,fields.name(),-1)) duplicate("Tên nhóm tùy chọn đã có trong sản phẩm này.");
        var row=groups.saveAndFlush(new ProductOptionGroup(productId,fields.name(),fields.selectionType(),fields.required(),fields.min(),fields.max(),fields.sortOrder()));
        audit(actor,"OPTION_GROUP_CREATED","OptionGroup",row.getId(),null,group(row));
        return ApiResponse.success(group(row),"Thêm nhóm tùy chọn thành công.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Group> updateGroup(Integer id,ConfigRequests.Group request,CatalogActor actor) {
        var row=lockGroup(id); var before=group(row); var fields=groupFields(request);
        if(groups.existsByProductIdAndNameIgnoreCaseAndIdNot(row.getProductId(),fields.name(),id)) duplicate("Tên nhóm tùy chọn đã có trong sản phẩm này.");
        row.replace(fields.name(),fields.selectionType(),fields.required(),fields.min(),fields.max(),fields.sortOrder()); var after=group(row);
        if(!before.equals(after)) {groups.flush();audit(actor,"OPTION_GROUP_UPDATED","OptionGroup",id,before,after);}
        return ApiResponse.success(after,before.equals(after)?"Thông tin nhóm tùy chọn không thay đổi.":"Cập nhật nhóm tùy chọn thành công.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Option> createOption(Integer groupId,OptionCreateRequest request,CatalogActor actor) {
        lockGroup(groupId); var fields=optionFields(request);
        if(options.existsByGroupIdAndOptionNameIgnoreCaseAndIdNot(groupId,fields.name(),-1)) duplicate("Tên tùy chọn đã có trong nhóm này.");
        var row=options.saveAndFlush(new ProductOption(groupId,fields.name(),fields.extraPrice(),fields.defaultOption(),fields.sortOrder(),fields.status()));
        audit(actor,"OPTION_CREATED","Option",row.getId(),null,option(row));
        return ApiResponse.success(option(row),"Thêm tùy chọn thành công.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Option> updateOption(Integer id,OptionCreateRequest request,CatalogActor actor) {
        var row=lockOption(id); var before=option(row); var fields=optionFields(request);
        if(options.existsByGroupIdAndOptionNameIgnoreCaseAndIdNot(row.getGroupId(),fields.name(),id)) duplicate("Tên tùy chọn đã có trong nhóm này.");
        row.replace(fields.name(),fields.extraPrice(),fields.defaultOption(),fields.sortOrder(),fields.status()); var after=option(row);
        if(!before.equals(after)) {options.flush();audit(actor,"OPTION_UPDATED","Option",id,before,after);}
        return ApiResponse.success(after,before.equals(after)?"Thông tin tùy chọn không thay đổi.":"Cập nhật tùy chọn thành công.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.Status> optionStatus(Integer id,MenuStatus status,CatalogActor actor) {
        requireStatus(status); var row=lockOption(id); var before=option(row);
        if(row.getStatus()!=status) {row.changeStatus(status);options.flush();audit(actor,"OPTION_STATUS_CHANGED","Option",id,before,option(row));}
        return ApiResponse.success(new ConfigResponse.Status(id,row.getStatus()),"Đã cập nhật trạng thái tùy chọn.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.VariantAvailability> variantAvailability(Integer branchId,Integer id,ConfigRequests.Availability request,CatalogActor actor) {
        checkAvailability(branchId,request); lockVariant(id);
        var row=branchVariants.findByBranchIdAndVariantId(branchId,id).orElseGet(()->new BranchProductAvailability(branchId,id));
        var before=row.getId()==null?null:variantAvailability(row); String reason=reason(request);
        if(before==null || row.isAvailable()!=request.available() || !Objects.equals(row.getUnavailableReason(),reason)) {
            row.change(request.available(),reason);branchVariants.saveAndFlush(row);
            audit(actor,"VARIANT_AVAILABILITY_CHANGED","Variant",id,before,variantAvailability(row));
        }
        return ApiResponse.success(variantAvailability(row),"Đã cập nhật khả dụng của biến thể tại chi nhánh.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public ApiResponse<ConfigResponse.OptionAvailability> optionAvailability(Integer branchId,Integer id,ConfigRequests.Availability request,CatalogActor actor) {
        checkAvailability(branchId,request); lockOption(id);
        var row=branchOptions.findByBranchIdAndOptionId(branchId,id).orElseGet(()->new BranchOptionAvailability(branchId,id));
        var before=row.getId()==null?null:optionAvailability(row); String reason=reason(request);
        if(before==null || row.isAvailable()!=request.available() || !Objects.equals(row.getUnavailableReason(),reason)) {
            row.change(request.available(),reason);branchOptions.saveAndFlush(row);
            audit(actor,"OPTION_AVAILABILITY_CHANGED","Option",id,before,optionAvailability(row));
        }
        return ApiResponse.success(optionAvailability(row),"Đã cập nhật khả dụng của tùy chọn tại chi nhánh.");
    }
    private Product lockProduct(Integer id) {return products.findByIdForUpdate(id).orElseThrow(()->missing("Sản phẩm"));}
    private ProductVariant lockVariant(Integer id) {lockProduct(variants.productIdOf(id).orElseThrow(()->missing("Biến thể")));return variants.findById(id).orElseThrow(()->missing("Biến thể"));}
    private ProductOptionGroup lockGroup(Integer id) {lockProduct(groups.productIdOf(id).orElseThrow(()->missing("Nhóm tùy chọn")));return groups.findById(id).orElseThrow(()->missing("Nhóm tùy chọn"));}
    private ProductOption lockOption(Integer id) {lockProduct(options.productIdOf(id).orElseThrow(()->missing("Tùy chọn")));return options.findById(id).orElseThrow(()->missing("Tùy chọn"));}
    private ApiException missing(String label) {return new ApiException(NOT_FOUND,"NOT_FOUND",label+" không tồn tại. Vui lòng kiểm tra lại.");}
    private void duplicate(String message) {throw new ApiException(CONFLICT,"DUPLICATE_PRODUCT_CONFIGURATION",message);}
    private void requireStatus(MenuStatus status) {if(status==null) invalid("Vui lòng chọn trạng thái Active hoặc Inactive.");}
    private ProductValidation.Group groupFields(ConfigRequests.Group r) {
        String name=requiredName(r.getName(),"Tên nhóm tùy chọn",50); int min=r.getMinSelect(),max=r.getMaxSelect();
        if(r.getSelectionType()==null || min<0 || max<1 || max>255 || min>max ||
                (r.getSelectionType()==SelectionType.Single && max!=1) || (r.getRequired() && min<1))
            invalid("Nhóm tùy chọn phải thỏa min/max, Single có max=1 và nhóm bắt buộc có min≥1.");
        return new ProductValidation.Group(name,r.getSelectionType(),r.getRequired(),min,max,order(r.getSortOrder()),List.of());
    }
    private ProductValidation.Option optionFields(OptionCreateRequest r) {
        requireStatus(r.getStatus());return new ProductValidation.Option(requiredName(r.getOptionName(),"Tên tùy chọn",100),money(r.getExtraPrice()),r.getDefaultOption(),order(r.getSortOrder()),r.getStatus());
    }
    private void checkAvailability(Integer branch,ConfigRequests.Availability request) {
        if(branch==null || branch<=0 || request.available()==null) invalid("Mã chi nhánh phải dương và is_available phải là true hoặc false.");
        if(request.reason()!=null && request.reason().codePointCount(0,request.reason().length())>255) invalid("Lý do ngừng bán không được vượt quá 255 ký tự.");
        store.requireExists(branch);
    }
    private String reason(ConfigRequests.Availability request) {return request.available() || request.reason()==null || request.reason().isBlank()?null:request.reason().strip();}
    private void audit(CatalogActor actor,String action,String entity,Integer id,Object before,Object after) {
        audits.save(new AuditLog(actor,action,entity,id,map(before),map(after)));
    }
    private Map<String,Object> map(Object value) {return value==null?null:JSON.convertValue(value,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});}
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON=new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
    private ConfigResponse.Variant variant(ProductVariant v) {return new ConfigResponse.Variant(v.getId(),v.getProductId(),v.getVariantName(),v.getPrice(),v.getSortOrder(),v.getStatus());}
    private ConfigResponse.Group group(ProductOptionGroup g) {return new ConfigResponse.Group(g.getId(),g.getProductId(),g.getName(),g.getSelectionType(),g.isRequired(),g.getMinSelect(),g.getMaxSelect(),g.getSortOrder());}
    private ConfigResponse.Option option(ProductOption o) {return new ConfigResponse.Option(o.getId(),o.getGroupId(),o.getOptionName(),o.getExtraPrice(),o.isDefaultOption(),o.getSortOrder(),o.getStatus());}
    private ConfigResponse.VariantAvailability variantAvailability(BranchProductAvailability a) {return new ConfigResponse.VariantAvailability(a.getBranchId(),a.getVariantId(),a.isAvailable(),a.getUnavailableReason(),a.getUpdatedAt());}
    private ConfigResponse.OptionAvailability optionAvailability(BranchOptionAvailability a) {return new ConfigResponse.OptionAvailability(a.getBranchId(),a.getOptionId(),a.isAvailable(),a.getUnavailableReason(),a.getUpdatedAt());}
}
