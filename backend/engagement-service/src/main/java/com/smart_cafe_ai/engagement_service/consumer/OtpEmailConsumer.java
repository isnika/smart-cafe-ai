package com.smart_cafe_ai.engagement_service.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_cafe_ai.engagement_service.config.RabbitMQConfig;
import com.smart_cafe_ai.engagement_service.dto.OtpEmailEvent;
import com.smart_cafe_ai.engagement_service.service.NotificationService;
import jakarta.validation.Validator;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class OtpEmailConsumer {
    private final ObjectMapper objectMapper;
    private final Validator validator;
    private final NotificationService notificationService;

    public OtpEmailConsumer(ObjectMapper objectMapper, Validator validator, NotificationService notificationService) {
        this.objectMapper = objectMapper;
        this.validator = validator;
        this.notificationService = notificationService;
    }

    @RabbitListener(queues = RabbitMQConfig.QUEUE)
    public void consume(Message message) {
        OtpEmailEvent event;
        try {
            // Read the JSON contract explicitly; never resolve Identity's Java class/type headers.
            event = objectMapper.readValue(message.getBody(), OtpEmailEvent.class);
            if (event == null || !validator.validate(event).isEmpty()) {
                throw new IllegalArgumentException("Invalid event");
            }
        } catch (Exception ex) {
            throw new AmqpRejectAndDontRequeueException("Invalid OTP email event");
        }
        notificationService.sendOtpEmail(event);
    }
}
