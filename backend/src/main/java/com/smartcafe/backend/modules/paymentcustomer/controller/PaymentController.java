package com.smartcafe.backend.modules.paymentcustomer.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// BE2 phụ trách module này (Payment & Customer)
// Mọi API của module này nằm dưới prefix /api/payment-customer
@RestController
@RequestMapping("/api/payment-customer")
public class PaymentController {

    @PostMapping("/payments")
    public ResponseEntity<String> processPayment() {
        // TODO: BE2 code logic xử lý thanh toán
        return ResponseEntity.ok("Xử lý thanh toán - đang phát triển");
    }

}
