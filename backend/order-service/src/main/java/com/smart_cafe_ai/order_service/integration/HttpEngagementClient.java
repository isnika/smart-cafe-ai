package com.smart_cafe_ai.order_service.integration;

import com.fasterxml.jackson.databind.*;
import com.smart_cafe_ai.order_service.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import static org.springframework.http.HttpStatus.*;

@Component
public class HttpEngagementClient implements EngagementClient {
    private final String base,key;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    public HttpEngagementClient(@Value("${app.engagement.internal-base-url:http://localhost:8087/api/v1/internal}") String base,
            @Value("${app.engagement.auth-value:}") String key,ObjectMapper json) { this.base=base;this.key=key;this.json=json; }
    public void requireConfigured() {
        if(base.isBlank()||key.isBlank()) throw new ApiException(SERVICE_UNAVAILABLE,"ENGAGEMENT_INTEGRATION_NOT_CONFIGURED","Chưa cấu hình URL và khóa nội bộ Engagement.");
    }
    public void redeem(String user,Long order) {
        var data=call("/loyalty/redeem",Map.of("user_id",user,"order_id",order,"idempotency_key","order:"+order+":reward"));
        var tx=data.path("transaction");
        if(!order.equals(positiveLong(tx.path("order_id")))||!user.equals(tx.path("user_id").asText())
                ||!"Redeem".equals(tx.path("transaction_type").asText())||!tx.path("stamps").isIntegralNumber()||tx.path("stamps").asInt()!=-10) throw unavailable();
    }
    public BigDecimal apply(String code,String user,Long order,Integer branch,String fulfillment,BigDecimal amount) {
        var data=call("/vouchers/apply",Map.of("code",code,"user_id",user,"order_id",order,"branch_id",branch,
                "fulfillment_type",fulfillment,"order_amount",amount));
        var value=data.path("discount_amount");
        if(!order.equals(positiveLong(data.path("order_id")))||positiveLong(data.path("voucher_id"))==null
                ||!"Applied".equals(data.path("status").asText())||!value.isNumber()) throw unavailable();
        BigDecimal discount=value.decimalValue();
        if(discount.signum()<0||discount.compareTo(amount)>0||discount.stripTrailingZeros().scale()>0) throw unavailable();
        return discount;
    }
    public void reverse(String user,Long order) {
        var data=call("/benefits/reverse",Map.of("user_id",user,"order_id",order));
        if(!order.equals(positiveLong(data.path("order_id")))||!"Reversed".equals(data.path("status").asText())) throw unavailable();
    }
    private Long positiveLong(JsonNode node) { return node.isIntegralNumber()&&node.canConvertToLong()&&node.longValue()>0?node.longValue():null; }
    private JsonNode call(String path,Object body) {
        requireConfigured();
        for(int attempt=0;attempt<2;attempt++) {
            try {
                URI uri=URI.create(base.replaceAll("/+$","")+path);
                if(uri.getHost()==null||uri.getUserInfo()!=null||!("http".equals(uri.getScheme())||"https".equals(uri.getScheme()))) throw unavailable();
                var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(4)).header("X-Service-Key",key)
                        .header("Content-Type","application/json").header("Accept","application/json");
                String trace=org.slf4j.MDC.get("trace_id");if(trace!=null)request.header("X-Trace-Id",trace);
                var response=http.send(request.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()>=500&&attempt==0) continue;
                var envelope=json.readTree(response.body());
                if(response.statusCode()==400||response.statusCode()==409||response.statusCode()==422) {
                    String code=envelope.path("error").path("code").asText("ENGAGEMENT_REJECTED");
                    if(response.statusCode()==409&&"CONFLICT".equals(code)&&attempt==0) continue;
                    throw new ApiException(response.statusCode()==409?CONFLICT:UNPROCESSABLE_ENTITY,code,
                            "Engagement từ chối yêu cầu: "+envelope.path("error").path("message").asText("Kiểm tra voucher hoặc số dư tem."));
                }
                if((response.statusCode()!=200&&response.statusCode()!=201)||!envelope.path("success").asBoolean()
                        ||!envelope.path("data").isObject()) throw unavailable();
                return envelope.path("data");
            } catch(ApiException ex) { throw ex; }
            catch(InterruptedException ex) { Thread.currentThread().interrupt();throw unavailable(); }
            catch(Exception ex) { if(attempt==1)throw unavailable(); }
        }
        throw unavailable();
    }
    private ApiException unavailable() { return new ApiException(SERVICE_UNAVAILABLE,"ENGAGEMENT_UNAVAILABLE","Không thể xác nhận kết quả từ Engagement. Ưu đãi của checkout thất bại sẽ được hoàn tác."); }
}
