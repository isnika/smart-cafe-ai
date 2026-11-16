package com.smart_cafe_ai.store_service.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.smart_cafe_ai.store_service.service.QrCodeService;

import com.google.zxing.WriterException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/qr")
public class QrCodeController {

  private final QrCodeService qrCodeService;

  public QrCodeController(QrCodeService qrCodeService) {
    this.qrCodeService = qrCodeService;
  }

  @GetMapping(produces = MediaType.IMAGE_PNG_VALUE)
  public ResponseEntity<byte[]> generateQr(
      @RequestParam String content) throws WriterException, IOException {

    byte[] image = qrCodeService.generateQrCode(
        content, 300, 300);

    return ResponseEntity.ok()
        .contentType(MediaType.IMAGE_PNG)
        .cacheControl(CacheControl.noStore())
        .body(image);
  }
}