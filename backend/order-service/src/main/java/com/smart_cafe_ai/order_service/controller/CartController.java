package com.smart_cafe_ai.order_service.controller;
import com.smart_cafe_ai.order_service.dto.*;
import com.smart_cafe_ai.order_service.dto.Requests.*;
import com.smart_cafe_ai.order_service.model.Types.Source;
import com.smart_cafe_ai.order_service.security.Access;
import com.smart_cafe_ai.order_service.service.CartService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/carts")
public class CartController {
    public CartController(CartService service, Access access) {
        this.service=service;
        this.access=access;
    }

    private final CartService service;
    private final Access access;
    @PostMapping public ResponseEntity<ApiResponse> create(@Valid @RequestBody CartCreate body,HttpServletRequest request){var result=service.create(body,access.context(request));return ResponseEntity.status(result.created()?201:200).body(ApiResponse.ok(result.cart()));}
    @GetMapping("/current") public ApiResponse current(@RequestParam Source source,HttpServletRequest request){return ApiResponse.ok(service.get(source,access.context(request)));}
    @PostMapping("/current/items") public ResponseEntity<ApiResponse> add(@RequestParam Source source,@Valid @RequestBody Item body,HttpServletRequest request){return ResponseEntity.status(201).body(ApiResponse.ok(service.add(source,body,access.context(request))));}
    @PutMapping("/current/items/{itemId}") public ApiResponse update(@RequestParam Source source,@PathVariable @Positive Long itemId,@Valid @RequestBody ItemUpdate body,HttpServletRequest request){return ApiResponse.ok(service.update(source,itemId,body,access.context(request)));}
    @DeleteMapping("/current/items/{itemId}") public ResponseEntity<Void> delete(@RequestParam Source source,@PathVariable @Positive Long itemId,HttpServletRequest request){service.remove(source,itemId,access.context(request));return ResponseEntity.noContent().build();}
    @DeleteMapping("/current") public ResponseEntity<Void> abandon(@RequestParam Source source,HttpServletRequest request){service.abandon(source,access.context(request));return ResponseEntity.noContent().build();}
}
