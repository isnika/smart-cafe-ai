package com.smart_cafe_ai.store_service.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

@Service
public class QrCodeService {
  public byte[] generateQrCode(String content, int width, int height)
      throws WriterException, IOException {

    if (content == null || content.isBlank()) {
      throw new IllegalArgumentException("Nội dung QR không được để trống");
    }

    if (width < 100 || width > 1000
        || height < 100 || height > 1000) {
      throw new IllegalArgumentException("Kích thước QR không hợp lệ");
    }

    var hints = Map.of(
        EncodeHintType.CHARACTER_SET, "UTF-8",
        EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);

    var matrix = new QRCodeWriter().encode(
        content,
        BarcodeFormat.QR_CODE,
        width,
        height,
        hints);

    try (var output = new ByteArrayOutputStream()) {
      MatrixToImageWriter.writeToStream(
          matrix, "PNG", output);
      return output.toByteArray();
    }
  }
}
