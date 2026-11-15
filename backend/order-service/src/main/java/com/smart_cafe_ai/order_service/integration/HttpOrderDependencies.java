package com.smart_cafe_ai.order_service.integration;

import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.order_service.dto.Requests.Item;
import com.smart_cafe_ai.order_service.exception.ApiException;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriUtils;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Component
public class HttpOrderDependencies implements OrderDependencies {
    private final Environment env;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    public HttpOrderDependencies(Environment env,ObjectMapper json){this.env=env;this.json=json;}
    @Override public Branch branch(Integer id){
        var data=call("store","/branches/"+id,null);
        var b=convert(data,Branch.class,"store");
        if(!id.equals(b.id())||!Set.of("Active","Inactive").contains(b.status()==null?"":b.status())||!data.path("accepts_online_orders").isBoolean()||!money(b.deliveryFee()))throw unavailable("store");
        return b;
    }
    @Override public Session sessionByCode(String code){return session("/table-sessions/by-code/"+UriUtils.encodePathSegment(code,StandardCharsets.UTF_8));}
    @Override public Session sessionById(Long id){var s=session("/table-sessions/"+id);if(!id.equals(s.id()))throw unavailable("store");return s;}
    private Session session(String path){var s=convert(call("store",path,null),Session.class,"store");if(s.id()==null||s.id()<=0||s.branchId()==null||s.branchId()<=0||s.status()==null)throw unavailable("store");return s;}
    @Override public Staff staff(String userId){
        var s=convert(call("store","/staff-profiles/by-user/"+UriUtils.encodePathSegment(userId,StandardCharsets.UTF_8),null),Staff.class,"store");
        if(!userId.equals(s.userId())||s.branchId()==null||s.branchId()<=0||s.status()==null)throw unavailable("store");return s;
    }
    @Override public void requireCustomer(String userId){
        // Identity currently provides a batch lookup; use it instead of reading its database.
        var data=call("identity","/users/batch",Map.of("ids",List.of(userId)));
        if(!data.isArray())throw unavailable("identity");
        for(var u:data){
            String roleName = u.path("role_name").asText();
            if(userId.equals(u.path("id").asText())&&"Active".equals(u.path("status").asText())&&("ROLE_CUSTOMER".equalsIgnoreCase(roleName)||"Customer".equalsIgnoreCase(roleName)))return;
        }
        throw new ApiException(UNPROCESSABLE_ENTITY,"CUSTOMER_NOT_FOUND","Khách hàng không tồn tại hoặc không hoạt động.");
    }
    @Override public List<ResolvedItem> resolve(Integer branchId,List<Item> items){
        var requestItems=items.stream().map(i->Map.of("variant_id",i.variantId(),"options",i.options())).toList();
        var data=call("catalog","/resolve",Map.of("branch_id",branchId,"items",requestItems));
        var array=data.path("items");if(!array.isArray()||array.size()!=items.size())throw unavailable("catalog");
        var result=new ArrayList<ResolvedItem>();
        for(int i=0;i<array.size();i++){
            var node=array.get(i);var resolved=convert(node,ResolvedItem.class,"catalog");
            if(!items.get(i).variantId().equals(resolved.variantId())||resolved.productId()==null||resolved.productName()==null||resolved.variantName()==null||
                    !money(resolved.price())||resolved.options()==null||!node.path("is_available").asBoolean()||!"Active".equals(node.path("status").asText()))throw unavailable("catalog");
            var expected=new HashMap<Integer,Integer>();items.get(i).options().forEach(o->expected.put(o.optionId(),o.quantity()));
            for(var option:resolved.options()){
                if(option.optionId()==null||option.optionName()==null||!money(option.extraPrice())||!Objects.equals(expected.remove(option.optionId()),option.quantity()))throw unavailable("catalog");
            }
            if(!expected.isEmpty())throw unavailable("catalog");result.add(resolved);
        }
        return result;
    }
    private <T> T convert(JsonNode node,Class<T> type,String service){try{return json.readerFor(type).without(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(node);}catch(Exception ex){throw unavailable(service);}}
    private JsonNode call(String service,String path,Object body){
        String base=env.getProperty("app."+service+".internal-base-url",""),header=env.getProperty("app."+service+".auth-header","X-Service-Key"),key=env.getProperty("app."+service+".auth-value","");
        if(base.isBlank()||header.isBlank()||key.isBlank())throw new ApiException(SERVICE_UNAVAILABLE,service.toUpperCase(Locale.ROOT)+"_INTEGRATION_NOT_CONFIGURED","Chưa cấu hình kết nối nội bộ "+service+". Xem order-service/README.md.");
        try{
            URI uri=URI.create(base.replaceAll("/+$","")+path);
            if(uri.getHost()==null||uri.getUserInfo()!=null||!("http".equals(uri.getScheme())||"https".equals(uri.getScheme())))throw unavailable(service);
            var req=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(4)).header(header,key).header("Accept","application/json");
            String trace=org.slf4j.MDC.get("trace_id");if(trace!=null)req.header("X-Trace-Id",trace);
            if(body==null)req.GET();else req.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
            var response=http.send(req.build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==404)throw ApiException.missing();
            JsonNode envelope=json.readTree(response.body());
            if(response.statusCode()==422||response.statusCode()==400){
                String code=envelope.path("error").path("code").asText("BUSINESS_RULE_VIOLATION");
                throw new ApiException(UNPROCESSABLE_ENTITY,code,"Dữ liệu không được "+service+" chấp nhận.");
            }
            if(response.statusCode()!=200||!envelope.path("success").asBoolean()||envelope.path("data").isMissingNode()||envelope.path("data").isNull())throw unavailable(service);
            return envelope.path("data");
        }catch(ApiException ex){throw ex;}catch(InterruptedException ex){Thread.currentThread().interrupt();throw unavailable(service);}catch(Exception ex){throw unavailable(service);}
    }
    private boolean money(java.math.BigDecimal value){return value!=null&&value.signum()>=0&&value.stripTrailingZeros().scale()<=0&&value.precision()-value.scale()<=15;}
    private ApiException unavailable(String service){return new ApiException(SERVICE_UNAVAILABLE,service.toUpperCase(Locale.ROOT)+"_UNAVAILABLE","Không thể xác minh dữ liệu từ "+service+"; service không sẵn sàng hoặc phản hồi sai contract.");}
}
