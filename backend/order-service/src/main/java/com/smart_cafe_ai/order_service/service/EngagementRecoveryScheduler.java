package com.smart_cafe_ai.order_service.service;

import com.smart_cafe_ai.order_service.repository.EngagementCheckoutRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.*;

@Component
@ConditionalOnProperty(name="app.engagement.recovery-enabled",havingValue="true",matchIfMissing=true)
public class EngagementRecoveryScheduler {
    private final EngagementCheckoutRepository attempts;
    private final EngagementCheckoutRecovery recovery;
    public EngagementRecoveryScheduler(EngagementCheckoutRepository attempts,EngagementCheckoutRecovery recovery) {this.attempts=attempts;this.recovery=recovery;}
    @Scheduled(fixedDelayString="${app.engagement.recovery-delay-ms:30000}")
    public void run() {
        for(Long id:attempts.ready(LocalDateTime.now(ZoneOffset.UTC),PageRequest.of(0,20))) recovery.recover(id);
    }
}
