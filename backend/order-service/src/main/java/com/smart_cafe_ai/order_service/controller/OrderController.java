package com.smart_cafe_ai.order_service.controller;

import com.smart_cafe_ai.order_service.dto.*;
import com.smart_cafe_ai.order_service.dto.Requests.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import com.smart_cafe_ai.order_service.security.Access;
import com.smart_cafe_ai.order_service.service.*;
import com.smart_cafe_ai.order_service.service.OrderQueryService.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@RestController @RequestMapping("/api/v1/orders")
public class OrderController {
    public OrderController(OrderService service, OrderQueryService queries, Access access) {
        this.service=service;
        this.queries=queries;
        this.access=access;
    }

    private final OrderService service;
    private final OrderQueryService queries;
    private final Access access;
    @PostMapping public ResponseEntity<ApiResponse> create(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody CreateOrder body,HttpServletRequest req){var result=service.create(body,key,access.context(req));return ResponseEntity.status(result.replay()?200:201).body(ApiResponse.ok(result.order()));}
    @GetMapping("/me") public ApiResponse mine(@RequestParam(required=false) Status status,@RequestParam(name="payment_status",required=false) PaymentStatus payment,
            @RequestParam(required=false) String from,@RequestParam(required=false) String to,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="created_at,desc") String sort,HttpServletRequest req){
        return queries.list(new Filter(null,status,payment,null,null,from,to),access.context(req),true,page,size,sort);
    }
    @GetMapping("/me/{id}") public ApiResponse mineDetail(@PathVariable @Positive Long id,HttpServletRequest req){return ApiResponse.ok(service.mine(id,access.context(req)));}
    @GetMapping("/table-session") public ApiResponse session(@RequestParam(required=false) Status status,HttpServletRequest req){return ApiResponse.ok(service.sessionOrders(access.context(req),status));}
    @GetMapping("/table-session/{id}") public ApiResponse sessionDetail(@PathVariable @Positive Long id,HttpServletRequest req){return ApiResponse.ok(service.sessionDetail(id,access.context(req)));}
    @GetMapping public ApiResponse list(@RequestParam(name="branch_id",required=false) Integer branch,@RequestParam(required=false) Status status,@RequestParam(name="payment_status",required=false) PaymentStatus payment,
            @RequestParam(name="order_source",required=false) Source source,@RequestParam(name="fulfillment_type",required=false) Fulfillment fulfillment,
            @RequestParam(required=false) String from,@RequestParam(required=false) String to,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="created_at,desc") String sort,HttpServletRequest req){
        return queries.list(new Filter(branch,status,payment,source,fulfillment,from,to),access.context(req),false,page,size,sort);
    }
    @GetMapping("/{id}") public ApiResponse detail(@PathVariable @Positive Long id,HttpServletRequest req){return ApiResponse.ok(service.staffDetail(id,access.context(req)));}
    @PatchMapping("/{id}/status") public ApiResponse status(@PathVariable @Positive Long id,@Valid @RequestBody ChangeStatus body,HttpServletRequest req){return ApiResponse.ok(service.change(id,body,access.context(req)));}
    @GetMapping("/{id}/history") public ApiResponse history(@PathVariable @Positive Long id,HttpServletRequest req){return ApiResponse.ok(service.history(id,access.context(req)));}
    @GetMapping("/summary") public ApiResponse summary(@RequestParam(name="branch_id",required=false) Integer branch,@RequestParam(required=false) String from,@RequestParam(required=false) String to,HttpServletRequest req){return ApiResponse.ok(queries.summary(new Filter(branch,null,null,null,null,from,to),access.context(req)));}
    @GetMapping("/reports/sales") public ApiResponse sales(@RequestParam(name="branch_id",required=false) Integer branch,@RequestParam LocalDate from,@RequestParam LocalDate to,
            @RequestParam(name="group_by",defaultValue="day") String group,@RequestParam(name="order_source",required=false) Source source,@RequestParam(name="fulfillment_type",required=false) Fulfillment fulfillment,HttpServletRequest req){
        return ApiResponse.ok(queries.sales(branch,from,to,group,source,fulfillment,access.context(req)));
    }
    @GetMapping("/reports/top-products") public ApiResponse top(@RequestParam(name="branch_id",required=false) Integer branch,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="10") int limit,HttpServletRequest req){return ApiResponse.ok(queries.top(branch,from,to,limit,access.context(req)));}
}
