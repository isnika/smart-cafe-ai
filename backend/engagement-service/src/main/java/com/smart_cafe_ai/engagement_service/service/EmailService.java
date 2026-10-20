package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.dto.OtpEmailEvent;
import jakarta.mail.MessagingException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;

/** SMTP delivery only; persistence and delivery state belong to NotificationService. */
@Service
public class EmailService {
    private final JavaMailSender mailSender;
    private final String from;

    public EmailService(JavaMailSender mailSender, @Value("${app.mail.from}") String from) {
        this.mailSender = mailSender;
        this.from = from;
    }

    public void sendOtpEmail(OtpEmailEvent event) {
        String action = switch (event.purpose()) {
            case "Register" -> "xác thực tài khoản";
            case "Reset_Password" -> "đặt lại mật khẩu";
            case "Change_Password" -> "đổi mật khẩu";
            case "Change_Email" -> "xác thực email mới";
            default -> throw new IllegalArgumentException("Unsupported OTP purpose");
        };
        long remainingSeconds = Math.max(1, Duration.between(Instant.now(), event.expiresAt()).getSeconds());
        try {
            var message = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(event.email());
            helper.setSubject("Smart Cafe AI - Mã OTP " + action);
            helper.setText("""
                    Xin chào,

                    Mã OTP để %s của bạn là: %s

                    Mã còn hiệu lực khoảng %d giây. Vui lòng không chia sẻ mã này với bất kỳ ai.
                    Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.

                    Smart Cafe AI
                    """.formatted(action, event.otpCode(), remainingSeconds), false);
            mailSender.send(message);
        } catch (MessagingException ex) {
            throw new MailSendException("Could not construct OTP email");
        }
    }
}
