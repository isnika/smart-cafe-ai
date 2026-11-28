package com.smart_cafe_ai.intelligence_service.dto.chat;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateChatSessionRequest {
    /** Chỉ dùng cho guest; userId trong request cũ bị bỏ qua khi có JWT. */
    @Size(max = 64)
    private String guestKey;

    /** Tùy chọn để khôi phục chính xác một phiên đã biết. */
    @Min(1)
    private Long sessionId;

    /** true tạo phiên mới thay vì tái sử dụng phiên Active gần nhất. */
    private boolean newSession;

    @Min(1)
    @Max(2_147_483_647L)
    private Integer branchId;

    /** Tương thích payload cũ; backend không bao giờ dùng giá trị này làm chủ phiên. */
    @Size(max = 128)
    @SuppressWarnings("unused")
    private String userId;
}
