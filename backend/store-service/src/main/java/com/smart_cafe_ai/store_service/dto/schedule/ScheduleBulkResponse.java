package com.smart_cafe_ai.store_service.dto.schedule;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScheduleBulkResponse {

    @JsonProperty("created_count")
    private int createdCount;

    private List<String> conflicts;
}
