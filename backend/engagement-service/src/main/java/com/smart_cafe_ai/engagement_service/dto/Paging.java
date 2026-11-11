package com.smart_cafe_ai.engagement_service.dto;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import org.springframework.data.domain.*;
import java.util.Map;
public final class Paging {
    private Paging() { }
    public static Pageable of(int page,int size,String sort,Map<String,String> fields) {
        if(page<1||size<1||size>100) throw ApiException.invalid("page >= 1; size trong khoảng 1–100.");
        String[] parts=sort.split(",",-1);
        if(parts.length!=2||!fields.containsKey(parts[0])||!(parts[1].equals("asc")||parts[1].equals("desc"))) throw ApiException.invalid("sort phải có dạng field,asc|desc với field được hỗ trợ.");
        Sort ordering=Sort.by(Sort.Direction.fromString(parts[1]),fields.get(parts[0]));
        if(!fields.get(parts[0]).equals("id")) ordering=ordering.and(Sort.by(Sort.Direction.fromString(parts[1]),"id"));
        return PageRequest.of(page-1,size,ordering);
    }
}
