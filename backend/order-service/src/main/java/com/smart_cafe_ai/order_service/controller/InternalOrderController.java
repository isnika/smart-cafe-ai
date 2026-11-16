package com.smart_cafe_ai.order_service.controller;
import com.smart_cafe_ai.order_service.dto.ApiResponse;
import com.smart_cafe_ai.order_service.model.Types.PaymentStatus;
import com.smart_cafe_ai.order_service.security.Access;
import com.smart_cafe_ai.order_service.service.OrderService;
import jakarta.validation.constraints.Positive;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping({"/internal/orders","/api/v1/internal/orders"})
public class InternalOrderController {
    public InternalOrderController(OrderService orders, Access access) {
        this.orders=orders;
        this.access=access;
    }

    private final OrderService orders;
    private final Access access;
    @GetMapping("/{id}") public ApiResponse order(@RequestHeader(name="X-Service-Key",required=false) String key,@PathVariable @Positive Long id){access.internal(key);return ApiResponse.ok(orders.internal(id));}
    @GetMapping("/by-table-session/{tableSessionId}") public ApiResponse session(@RequestHeader(name="X-Service-Key",required=false) String key,@PathVariable @Positive Long tableSessionId,@RequestParam(name="payment_status",defaultValue="Unpaid") PaymentStatus payment){access.internal(key);return ApiResponse.ok(orders.internalSession(tableSessionId,payment));}
}
