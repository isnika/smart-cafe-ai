package com.smart_cafe_ai.engagement_service.service;

import com.smart_cafe_ai.engagement_service.dto.*;
import com.smart_cafe_ai.engagement_service.dto.Requests.TokenWrite;
import com.smart_cafe_ai.engagement_service.exception.ApiException;
import com.smart_cafe_ai.engagement_service.model.*;
import com.smart_cafe_ai.engagement_service.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
public class CustomerNotificationService {
    private final NotificationRepository notifications;
    private final DeviceTokenRepository devices;
    public CustomerNotificationService(NotificationRepository notifications,DeviceTokenRepository devices) { this.notifications=notifications; this.devices=devices; }
    @Transactional
    public DeviceToken register(String user,TokenWrite r) {
        var token=devices.findByPlatformAndToken(r.platform(),r.token()).orElseGet(DeviceToken::new);
        if(token.userId!=null&&!token.userId.equals(user)) throw ApiException.conflict("Token thiết bị đang thuộc tài khoản khác.");
        token.userId=user; token.platform=r.platform(); token.token=r.token(); token.active=true; token.lastSeenAt=Instant.now();
        return devices.saveAndFlush(token);
    }
    @Transactional
    public void disable(String user,Long id) { devices.findByIdAndUserId(id,user).orElseThrow(ApiException::missing).active=false; }
    @Transactional(readOnly=true)
    public ApiResponse list(String user,Boolean read,String type,int page,int size,String sort) {
        var result=notifications.findAll((r,q,cb)->{
            var p=cb.equal(r.get("userId"),user);
            if(read!=null) p=cb.and(p,cb.equal(r.get("read"),read));
            if(type!=null) p=cb.and(p,cb.equal(r.get("type"),type));
            return p;
        },Paging.of(page,size,sort,Map.of("id","id","created_at","createdAt","sent_at","sentAt")));
        return ApiResponse.page(result.map(this::view));
    }
    @Transactional
    public Map<String,Object> read(String user,Long id,boolean read) {
        var n=notifications.findByIdAndUserId(id,user).orElseThrow(ApiException::missing);
        n.setRead(read); return Map.of("id",n.getId(),"is_read",n.isRead());
    }
    @Transactional
    public Map<String,Object> readAll(String user) { return Map.of("updated_count",notifications.markAllRead(user,Instant.now())); }
    @Transactional
    public void inApp(String user,String type,String title,String body,Map<String,Object> data) {
        if(user==null||user.isBlank()) return;
        notifications.save(Notification.inApp(user,type,title,body.length()>500?body.substring(0,500):body,data));
    }
    private Map<String,Object> view(Notification n) {
        var map=new LinkedHashMap<String,Object>(); map.put("id",n.getId()); map.put("type",n.getType()); map.put("channel",n.getChannel());
        map.put("title",n.getTitle()); map.put("body",n.getBody()); map.put("data",n.getData());
        String status=switch(n.getStatus()) { case PENDING->"Pending"; case SENT->"Sent"; case FAILED->"Failed"; case EXPIRED->"Expired"; };
        map.put("status",status); map.put("is_read",n.isRead()); map.put("sent_at",n.getSentAt()); map.put("created_at",n.getCreatedAt());
        return map;
    }
}
