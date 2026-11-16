package com.smart_cafe_ai.engagement_service.repository;
import com.smart_cafe_ai.engagement_service.model.DeviceToken;
import com.smart_cafe_ai.engagement_service.model.Types.Platform;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface DeviceTokenRepository extends JpaRepository<DeviceToken, Long> {
    Optional<DeviceToken> findByPlatformAndToken(Platform platform, String token);
    Optional<DeviceToken> findByIdAndUserId(Long id, String userId);
}
