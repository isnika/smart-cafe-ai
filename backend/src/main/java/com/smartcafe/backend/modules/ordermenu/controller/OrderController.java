package com.smartcafe.backend.modules.ordermenu.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// BE1 phụ trách module này (Order & Menu)
// Mọi API của module này nằm dưới prefix /api/order-menu để không đụng route của BE2
@RestController
@RequestMapping("/api/order-menu")
public class OrderController {

    @GetMapping("/orders")
    public ResponseEntity<String> getOrders() {
        // TODO: BE1 code logic lấy danh sách đơn hàng ở đây
        return ResponseEntity.ok("Danh sách order - đang phát triển");
    }

    @PostMapping("/orders")
    public ResponseEntity<String> createOrder() {
        // TODO: BE1 code logic tạo đơn hàng mới
        return ResponseEntity.ok("Tạo order mới - đang phát triển");
    }

}
