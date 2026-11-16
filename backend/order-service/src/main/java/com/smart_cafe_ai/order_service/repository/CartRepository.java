package com.smart_cafe_ai.order_service.repository;
import com.smart_cafe_ai.order_service.model.*;
import com.smart_cafe_ai.order_service.model.Types.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface CartRepository extends JpaRepository<Cart,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select c from Cart c where c.id=:id") Optional<Cart> lock(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Cart> findByUserIdAndCartSourceAndStatus(String userId,Source source,CartStatus status);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Cart> findByTableSessionIdAndClientKeyAndStatus(Long session,String key,CartStatus status);
    @Modifying @Query("update Cart c set c.status=:target where c.tableSessionId=:session and c.status=:current")
    int abandonSession(@Param("session") Long session,@Param("current") CartStatus current,@Param("target") CartStatus target);
    default int abandonSession(Long session){return abandonSession(session,CartStatus.Active,CartStatus.Abandoned);}
}
