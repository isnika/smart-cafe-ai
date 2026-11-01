package com.smart_cafe_ai.order_service.service;

import com.smart_cafe_ai.order_service.dto.Requests.*;
import com.smart_cafe_ai.order_service.exception.ApiException;
import com.smart_cafe_ai.order_service.integration.OrderDependencies;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import com.smart_cafe_ai.order_service.repository.CartRepository;
import com.smart_cafe_ai.order_service.security.Access;
import com.smart_cafe_ai.order_service.security.Access.Context;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;

@Service @Transactional
public class CartService {
    public CartService(CartRepository carts, Access access, OrderDependencies dependencies, ObjectMapper json) {
        this.carts=carts;
        this.access=access;
        this.dependencies=dependencies;
        this.json=json;
    }

    private final CartRepository carts;
    private final Access access;
    private final OrderDependencies dependencies;
    private final ObjectMapper json;
    public record Created(Object cart,boolean created) {}
    public Created create(CartCreate request,Context context){
        OrderPolicy.shape(request.cartSource(),request.fulfillmentType());
        if(request.cartSource()==Source.POS)throw ApiException.invalid("POS đặt trực tiếp bằng /orders.");
        OrderPolicy.branch(dependencies.branch(request.branchId()),request.cartSource());
        String user=null,key=null;Long session=null;
        Optional<Cart> existing;
        if(request.cartSource()==Source.Online){user=access.customer(context).userId();existing=carts.findByUserIdAndCartSourceAndStatus(user,Source.Online,CartStatus.Active);}
        else{
            var s=qrSession(context,true);if(!request.branchId().equals(s.branchId()))throw ApiException.forbidden();
            session=s.id();key=access.client(context);user=context.actor()==null?null:access.customer(context).userId();
            existing=carts.findByTableSessionIdAndClientKeyAndStatus(session,key,CartStatus.Active);
        }
        if(existing.isPresent()){
            var cart=carts.lock(existing.get().id).orElseThrow(ApiException::missing);
            if(cart.status!=CartStatus.Active)throw ApiException.conflict("CONFLICT","Giỏ vừa thay đổi. Hãy thử lại.");
            if(!cart.branchId.equals(request.branchId())||cart.fulfillmentType!=request.fulfillmentType())throw ApiException.conflict("CART_CONTEXT_CONFLICT","Giỏ hiện tại thuộc chi nhánh/hình thức khác. Hãy bỏ giỏ trước khi đổi.");
            return new Created(view(cart,false),false);
        }
        var cart=new Cart();cart.cartSource=request.cartSource();cart.branchId=request.branchId();cart.fulfillmentType=request.fulfillmentType();cart.userId=user;cart.tableSessionId=session;cart.clientKey=key;
        carts.saveAndFlush(cart);return new Created(view(cart,false),true);
    }
    public Cart current(Source source,Context context,boolean writing){
        Optional<Cart> found;
        if(source==Source.Online)found=carts.findByUserIdAndCartSourceAndStatus(access.customer(context).userId(),source,CartStatus.Active);
        else if(source==Source.QR){var s=qrSession(context,writing);found=carts.findByTableSessionIdAndClientKeyAndStatus(s.id(),access.client(context),CartStatus.Active);}
        else throw ApiException.invalid("source phải là Online hoặc QR.");
        var cart=carts.lock(found.orElseThrow(ApiException::missing).id).orElseThrow(ApiException::missing);
        if(cart.status!=CartStatus.Active)throw ApiException.conflict("CART_NOT_ACTIVE","Giỏ không còn hoạt động.");return cart;
    }
    public Cart checkout(Long id,Context context){
        if(id==null)throw ApiException.invalid("Đơn Online/QR cần cart_id.");
        var cart=carts.lock(id).orElseThrow(ApiException::missing);
        if(cart.cartSource==Source.Online){if(!Objects.equals(access.customer(context).userId(),cart.userId))throw ApiException.missing();}
        else{
            var s=qrSession(context,true);
            if(!Objects.equals(s.id(),cart.tableSessionId)||!Objects.equals(access.client(context),cart.clientKey))throw ApiException.missing();
        }
        if(cart.status!=CartStatus.Active)throw ApiException.conflict("CART_NOT_ACTIVE","Giỏ đã được đặt hoặc bỏ.");return cart;
    }
    public OrderDependencies.Session qrSession(Context context,boolean writing){
        if(context.sessionCode()==null||context.sessionCode().isBlank()||context.sessionCode().length()>50)throw ApiException.invalid("QR cần X-Table-Session-Code hợp lệ.");
        var s=dependencies.sessionByCode(context.sessionCode());OrderPolicy.active(s,writing);return s;
    }
    public Object get(Source source,Context context){return view(current(source,context,false),true);}
    public Object add(Source source,Item request,Context context){
        var cart=current(source,context,true);if(cart.items.size()>=100)throw ApiException.invalid("Giỏ có tối đa 100 dòng.");
        validateOptions(request.options());OrderPolicy.branch(dependencies.branch(cart.branchId),source);
        dependencies.resolve(cart.branchId,List.of(request));
        var item=new CartItem();item.cart=cart;item.variantId=request.variantId();item.quantity=request.quantity();item.note=request.note();setOptions(item,request.options());
        cart.items.add(item);cart.touch();carts.flush();return view(cart,true);
    }
    public Object update(Source source,Long itemId,ItemUpdate request,Context context){
        var cart=current(source,context,true);var item=item(cart,itemId);validateOptions(request.options());
        OrderPolicy.branch(dependencies.branch(cart.branchId),source);
        dependencies.resolve(cart.branchId,List.of(new Item(item.variantId,request.quantity(),request.note(),request.options())));
        item.quantity=request.quantity();item.note=request.note();item.options.clear();
        // Delete old options before inserting replacements with the same unique (item, option) key.
        carts.flush();setOptions(item,request.options());cart.touch();carts.flush();return view(cart,true);
    }
    public void remove(Source source,Long itemId,Context context){var cart=current(source,context,true);cart.items.remove(item(cart,itemId));cart.touch();}
    public void abandon(Source source,Context context){var cart=current(source,context,true);cart.status=CartStatus.Abandoned;cart.touch();}
    private CartItem item(Cart cart,Long id){return cart.items.stream().filter(i->i.id.equals(id)).findFirst().orElseThrow(ApiException::missing);}
    private void setOptions(CartItem item,List<Option> options){for(var option:options){var o=new CartOption();o.item=item;o.optionId=option.optionId();o.quantity=option.quantity();item.options.add(o);}}
    public static void validateOptions(List<Option> options){var seen=new HashSet<Integer>();for(var o:options)if(!seen.add(o.optionId()))throw ApiException.invalid("Một dòng không được trùng option_id.");}
    public static List<Item> lines(Cart cart){return cart.items.stream().map(i->new Item(i.variantId,i.quantity,i.note,i.options.stream().map(o->new Option(o.optionId,o.quantity)).toList())).toList();}
    private Object view(Cart cart,boolean price){
        var data=json.convertValue(cart,new TypeReference<LinkedHashMap<String,Object>>(){});
        if(price){var lines=lines(cart);var resolved=lines.isEmpty()?List.<OrderDependencies.ResolvedItem>of():dependencies.resolve(cart.branchId,lines);
            BigDecimal total=BigDecimal.ZERO;var rows=new ArrayList<Object>();
            for(int i=0;i<lines.size();i++){var r=resolved.get(i);var options=r.options().stream().map(o->o.extraPrice().multiply(BigDecimal.valueOf(o.quantity()))).reduce(BigDecimal.ZERO,BigDecimal::add);
                var line=r.price().add(options).multiply(BigDecimal.valueOf(lines.get(i).quantity()));total=total.add(line);
                rows.add(Map.of("cart_item_id",cart.items.get(i).id,"product_name",r.productName(),"variant_name",r.variantName(),"unit_price",r.price(),"options_unit_total",options,"line_total",line));
            }data.put("pricing",Map.of("sub_total",total,"items",rows));
        }
        return data;
    }
}
