package com.smart_cafe_ai.catalog_service.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.catalog_service.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import static org.springframework.http.HttpStatus.*;

@Component
public class HttpStoreBranchVerifier implements StoreBranchVerifier {
    private final String baseUrl,header,credential;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    public HttpStoreBranchVerifier(@Value("${app.store.internal-base-url:}") String baseUrl,
            @Value("${app.store.auth-header:}") String header,@Value("${app.store.auth-value:}") String credential,ObjectMapper json) {
        this.baseUrl=baseUrl;this.header=header;this.credential=credential;this.json=json;
    }
    @Override public void requireExists(Integer branchId) {
        if(baseUrl.isBlank() || header.isBlank() || credential.isBlank()) throw new ApiException(SERVICE_UNAVAILABLE,
                "STORE_INTEGRATION_NOT_CONFIGURED","Chưa kết nối Store Service để xác nhận chi nhánh. Vui lòng hoàn tất cấu hình tích hợp với backend 2.");
        try {
            URI uri=URI.create(baseUrl.replaceAll("/+$","")+"/branches/"+branchId);
            if(uri.getHost()==null || uri.getUserInfo()!=null || !("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())))
                throw new IllegalArgumentException("Invalid Store URL");
            var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3)).header(header,credential).header("Accept","application/json").GET().build();
            var response=http.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==404) throw new ApiException(NOT_FOUND,"BRANCH_NOT_FOUND","Chi nhánh không tồn tại trong Store Service.");
            if(response.statusCode()!=200) throw unavailable();
            var body=json.readTree(response.body());var id=body.path("data").path("id");
            if(!body.path("success").asBoolean(false) || !id.isIntegralNumber() || !id.canConvertToInt() || id.intValue()!=branchId) throw unavailable();
        } catch(ApiException ex){throw ex;}
        catch(InterruptedException ex){Thread.currentThread().interrupt();throw unavailable();}
        catch(Exception ex){throw unavailable();}
    }
    private ApiException unavailable(){return new ApiException(SERVICE_UNAVAILABLE,"STORE_UNAVAILABLE",
            "Chưa xác minh được chi nhánh vì Store Service không sẵn sàng hoặc phản hồi không đúng hợp đồng. Vui lòng thử lại sau.");}
}
