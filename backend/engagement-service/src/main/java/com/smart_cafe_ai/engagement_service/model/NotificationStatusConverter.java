package com.smart_cafe_ai.engagement_service.model;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Locale;
/** Accept both the original SQL's Pending/Sent/Failed and existing OTP uppercase rows. */
@Converter
public class NotificationStatusConverter implements AttributeConverter<Notification.Status,String> {
    public String convertToDatabaseColumn(Notification.Status status) { return status==null?null:status.name(); }
    public Notification.Status convertToEntityAttribute(String value) { return value==null?null:Notification.Status.valueOf(value.toUpperCase(Locale.ROOT)); }
}
