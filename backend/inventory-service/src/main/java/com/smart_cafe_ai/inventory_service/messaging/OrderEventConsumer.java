package com.smart_cafe_ai.inventory_service.messaging;

import com.rabbitmq.client.Channel;
import com.smart_cafe_ai.inventory_service.config.RabbitMQConfig;
import com.smart_cafe_ai.inventory_service.dto.event.OrderEventPayload;
import com.smart_cafe_ai.inventory_service.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderEventConsumer {

    private final InventoryService inventoryService;

    /**
     * Consumes OrderConfirmed events -> Auto deduct stock from inventory.
     * Uses manual acknowledge mode + idempotency check for reliability.
     */
    @RabbitListener(queues = RabbitMQConfig.INVENTORY_ORDER_CONFIRMED_QUEUE,
                    containerFactory = "rabbitListenerContainerFactory")
    public void handleOrderConfirmed(OrderEventPayload payload,
                                     Channel channel,
                                     @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        log.info("Received OrderConfirmed event: eventId={}, orderId={}, branchId={}",
                payload.getEventId(), payload.getOrderId(), payload.getBranchId());
        try {
            inventoryService.processOrderConfirmed(
                    payload.getEventId(),
                    payload.getOrderId(),
                    payload.getBranchId(),
                    payload.getItems()
            );
            channel.basicAck(deliveryTag, false);
            log.info("OrderConfirmed event processed and acknowledged: {}", payload.getEventId());
        } catch (Exception e) {
            log.error("Failed to process OrderConfirmed event: {}", payload.getEventId(), e);
            try {
                // Reject and requeue = false (send to DLQ or drop)
                channel.basicNack(deliveryTag, false, false);
            } catch (IOException ioException) {
                log.error("Failed to NACK message", ioException);
            }
        }
    }

    /**
     * Consumes OrderCancelled events -> Refund stock back to inventory.
     */
    @RabbitListener(queues = RabbitMQConfig.INVENTORY_ORDER_CANCELLED_QUEUE,
                    containerFactory = "rabbitListenerContainerFactory")
    public void handleOrderCancelled(OrderEventPayload payload,
                                     Channel channel,
                                     @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        log.info("Received OrderCancelled event: eventId={}, orderId={}, branchId={}",
                payload.getEventId(), payload.getOrderId(), payload.getBranchId());
        try {
            inventoryService.processOrderCancelled(
                    payload.getEventId(),
                    payload.getOrderId(),
                    payload.getBranchId(),
                    payload.getItems()
            );
            channel.basicAck(deliveryTag, false);
            log.info("OrderCancelled event processed and acknowledged: {}", payload.getEventId());
        } catch (Exception e) {
            log.error("Failed to process OrderCancelled event: {}", payload.getEventId(), e);
            try {
                channel.basicNack(deliveryTag, false, false);
            } catch (IOException ioException) {
                log.error("Failed to NACK message", ioException);
            }
        }
    }

    /**
     * Consumes OrderRejected events -> Same as cancelled: refund stock.
     */
    @RabbitListener(queues = RabbitMQConfig.INVENTORY_ORDER_REJECTED_QUEUE,
                    containerFactory = "rabbitListenerContainerFactory")
    public void handleOrderRejected(OrderEventPayload payload,
                                    Channel channel,
                                    @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        log.info("Received OrderRejected event: eventId={}, orderId={}, branchId={}",
                payload.getEventId(), payload.getOrderId(), payload.getBranchId());
        try {
            inventoryService.processOrderCancelled(
                    payload.getEventId(),
                    payload.getOrderId(),
                    payload.getBranchId(),
                    payload.getItems()
            );
            channel.basicAck(deliveryTag, false);
            log.info("OrderRejected event processed and acknowledged: {}", payload.getEventId());
        } catch (Exception e) {
            log.error("Failed to process OrderRejected event: {}", payload.getEventId(), e);
            try {
                channel.basicNack(deliveryTag, false, false);
            } catch (IOException ioException) {
                log.error("Failed to NACK message", ioException);
            }
        }
    }
}
