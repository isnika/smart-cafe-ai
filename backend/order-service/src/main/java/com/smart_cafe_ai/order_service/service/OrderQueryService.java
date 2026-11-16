package com.smart_cafe_ai.order_service.service;

import com.smart_cafe_ai.order_service.dto.ApiResponse;
import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import com.smart_cafe_ai.order_service.repository.OrderRepository;
import com.smart_cafe_ai.order_service.security.Access;
import com.smart_cafe_ai.order_service.security.Access.Context;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@Service @Transactional(readOnly=true)
public class OrderQueryService {
    public OrderQueryService(OrderRepository repository, OrderService orders, OrderEvents events, Access access) {
        this.repository=repository;
        this.orders=orders;
        this.events=events;
        this.access=access;
    }

    private final OrderRepository repository;
    private final OrderService orders;
    private final OrderEvents events;
    private final Access access;
    public record Filter(Integer branchId,Status status,PaymentStatus paymentStatus,Source source,Fulfillment fulfillment,String from,String to) {}
    public ApiResponse list(Filter filter,Context context,boolean mine,int page,int size,String sort){
        if(page<1||size<1||size>100)throw ApiException.invalid("page >= 1, size từ 1 đến 100.");
        String user=null;Integer branch=filter.branchId();
        if(mine)user=access.customer(context).userId();else branch=orders.requireBranch(context,branch);
        var result=repository.findAll(spec(filter,branch,user,false),PageRequest.of(page-1,size,sort(sort)));
        return ApiResponse.page(result.getContent().stream().map(events::summary).toList(),page,size,result.getTotalElements());
    }
    public Object summary(Filter filter,Context context){
        Integer branch=orders.requireBranch(context,filter.branchId());
        var rows=repository.findAll(spec(filter,branch,null,false));
        Map<String,Long> byStatus=new TreeMap<>(),bySource=new TreeMap<>(),byFulfillment=new TreeMap<>();
        for(var o:rows){byStatus.merge(o.status.name(),1L,Long::sum);bySource.merge(o.orderSource.name(),1L,Long::sum);byFulfillment.merge(o.fulfillmentType.name(),1L,Long::sum);}
        return Map.of("total_orders",rows.size(),"by_status",counts(byStatus,"status"),"by_source",counts(bySource,"order_source"),"by_fulfillment",counts(byFulfillment,"fulfillment_type"));
    }
    private List<Object> counts(Map<String,Long> values,String key){return values.entrySet().stream().map(e->(Object)Map.of(key,e.getKey(),"count",e.getValue())).toList();}
    public Object sales(Integer branch,LocalDate from,LocalDate to,String group,Source source,Fulfillment fulfillment,Context context){
        access.manager(context);branch=orders.requireBranch(context,branch);range(from,to);
        if(!Set.of("day","week","month").contains(group))throw ApiException.invalid("group_by phải là day, week hoặc month.");
        var filter=new Filter(branch,Status.Completed,null,source,fulfillment,from.toString(),to.toString());
        var periods=new TreeMap<String,Map<String,Object>>();
        for(var o:repository.findAll(spec(filter,branch,null,true))){
            var date=o.completedAt.toLocalDate();String period=switch(group){case "week"->date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString();case "month"->YearMonth.from(date).toString();default->date.toString();};
            var row=periods.computeIfAbsent(period,k->{var m=new LinkedHashMap<String,Object>();m.put("period",k);m.put("orders_count",0L);return m;});
            row.put("orders_count",(Long)row.get("orders_count")+1);
            sum(row,"sub_total",o.subTotal);sum(row,"item_discount_amount",o.itemDiscountAmount);sum(row,"voucher_discount_amount",o.voucherDiscountAmount);
            sum(row,"delivery_fee",o.deliveryFee);sum(row,"vat_amount",o.vatAmount);sum(row,"final_amount",o.finalAmount);
        }
        return new ArrayList<>(periods.values());
    }
    public Object top(Integer branch,LocalDate from,LocalDate to,int limit,Context context){
        access.manager(context);branch=orders.requireBranch(context,branch);range(from,to);if(limit<1||limit>100)throw ApiException.invalid("limit từ 1 đến 100.");
        var filter=new Filter(branch,Status.Completed,null,null,null,from.toString(),to.toString());var products=new HashMap<Integer,Map<String,Object>>();
        for(var o:repository.findAll(spec(filter,branch,null,true)))for(var i:o.items){
            var row=products.computeIfAbsent(i.variantId,k->{var m=new LinkedHashMap<String,Object>();m.put("product_id",i.productId);m.put("product_name",i.productName);m.put("variant_id",i.variantId);m.put("variant_name",i.variantName);m.put("quantity_sold",0L);m.put("revenue",BigDecimal.ZERO);return m;});
            row.put("quantity_sold",(Long)row.get("quantity_sold")+i.quantity);sum(row,"revenue",i.lineTotal());
        }
        return products.values().stream().sorted(Comparator.<Map<String,Object>,Long>comparing(r->(Long)r.get("quantity_sold")).reversed().thenComparing(r->(Integer)r.get("variant_id"))).limit(limit).toList();
    }
    private void range(LocalDate from,LocalDate to){if(from==null||to==null||to.isBefore(from)||to.isAfter(from.plusDays(366)))throw ApiException.invalid("Khoảng báo cáo cần from <= to và tối đa 367 ngày.");}
    private void sum(Map<String,Object> row,String key,BigDecimal value){row.put(key,((BigDecimal)row.getOrDefault(key,BigDecimal.ZERO)).add(value));}
    private Specification<CafeOrder> spec(Filter f,Integer branch,String user,boolean completedTime){
        var from=time(f.from(),false);var to=time(f.to(),true);
        if(from!=null&&to!=null&&from.isAfter(to))throw ApiException.invalid("from phải trước to.");
        if(branch!=null&&branch<1)throw ApiException.invalid("branch_id phải dương.");
        return (root,query,cb)->{
            var p=new ArrayList<jakarta.persistence.criteria.Predicate>();
            if(branch!=null)p.add(cb.equal(root.get("branchId"),branch));if(user!=null)p.add(cb.equal(root.get("userId"),user));
            if(f.status()!=null)p.add(cb.equal(root.get("status"),f.status()));if(f.paymentStatus()!=null)p.add(cb.equal(root.get("paymentStatus"),f.paymentStatus()));
            if(f.source()!=null)p.add(cb.equal(root.get("orderSource"),f.source()));if(f.fulfillment()!=null)p.add(cb.equal(root.get("fulfillmentType"),f.fulfillment()));
            String time=completedTime?"completedAt":"createdAt";
            if(from!=null)p.add(cb.greaterThanOrEqualTo(root.get(time),from));if(to!=null)p.add(cb.lessThanOrEqualTo(root.get(time),to));return cb.and(p.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }
    private LocalDateTime time(String value,boolean end){
        if(value==null)return null;
        try{if(value.length()==10)return end?LocalDate.parse(value).atTime(LocalTime.MAX):LocalDate.parse(value).atStartOfDay();
            try{return OffsetDateTime.parse(value).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();}catch(java.time.format.DateTimeParseException ex){return LocalDateTime.parse(value);}
        }catch(Exception ex){throw ApiException.invalid("Thời gian cần ISO-8601 hoặc yyyy-MM-dd.");}
    }
    private Sort sort(String value){
        String[] parts=value.split(",",-1);if(parts.length!=2||!(parts[1].equals("asc")||parts[1].equals("desc")))throw ApiException.invalid("sort=field,asc|desc.");
        var fields=Map.of("id","id","created_at","createdAt","updated_at","updatedAt","completed_at","completedAt","final_amount","finalAmount","status","status","order_code","orderCode");
        if(!fields.containsKey(parts[0]))throw ApiException.invalid("Trường sort không được hỗ trợ.");
        return Sort.by(Sort.Direction.fromString(parts[1]),fields.get(parts[0])).and(Sort.by(Sort.Direction.DESC,"id"));
    }
}
