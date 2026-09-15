package com.smartcafe.backend.modules.paymentcustomer.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payment-customer/customers")
public class CustomerController {

    @GetMapping
    public ResponseEntity<String> getCustomers() {
        // TODO: BE2 code logic lấy danh sách khách hàng / điểm tích lũy
        return ResponseEntity.ok("Danh sách khách hàng - đang phát triển");
    }

}
