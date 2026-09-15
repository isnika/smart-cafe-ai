package com.smartcafe.backend.modules.ordermenu.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/order-menu/menu")
public class MenuController {

    @GetMapping
    public ResponseEntity<String> getMenu() {
        // TODO: BE1 code logic lấy danh sách món ăn/thức uống
        return ResponseEntity.ok("Danh sách menu - đang phát triển");
    }

}
