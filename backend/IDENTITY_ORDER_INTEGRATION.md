# Identity → Order: JWT và trạng thái tài khoản

Identity cấp JWT chứa `sub` và `role`. Order tự xác minh chữ ký, hạn token và quyền bằng `JWT_SECRET` chung. Khi POS gắn khách vào đơn, Order vẫn dùng `POST /api/v1/internal/users/batch` với `X-Service-Key` để kiểm tra tài khoản Customer/Active. Không đọc chéo database.

## Thay đổi trạng thái tài khoản

Admin thay đổi trạng thái tài khoản hoặc luồng ManagerStaff hiện có thay đổi trạng thái nhân viên: khóa dòng User, lưu trạng thái và ghi Outbox_Events trong cùng transaction. Xác minh OTP đăng ký kích hoạt tài khoản cũng ghi event; tài khoản Banned/Deactivated không được cấp token qua verify OTP.

| Trạng thái mới | Routing key |
|---|---|
| Banned | `identity.user.banned` |
| Deactivated | `identity.user.deactivated` |
| Active | `identity.user.activated` |
| Unverified | `identity.user.status_changed` |

Giữ nguyên trạng thái không tạo event mới. Luồng ManagerStaff legacy vẫn bị chặn tại controller cho tới khi có phân quyền Store; thay đổi này không mở lại controller đó.

Event JSON phẳng:

```json
{
  "event_id": "4b2f698f-a85d-443b-9fca-33133706166e",
  "event_type": "identity.user.banned",
  "event_version": 1,
  "user_id": "user-001",
  "previous_status": "Active",
  "status": "Banned",
  "status_revision": 123,
  "occurred_at": "2026-11-02T10:00:00Z"
}
```

`status_revision` là ID outbox tăng dần; khóa User đảm bảo thứ tự thay đổi của cùng tài khoản. Không dùng thời điểm nhận message để quyết định trạng thái mới nhất. Không gửi email, mật khẩu hoặc OTP trong event.

Publisher dùng exchange Topic `smart-cafe.identity`, message persistent, publisher confirms và mandatory returns. Lỗi broker hoặc không route được giữ event Pending để retry bằng cùng event_id. Publisher này chỉ đọc bốn loại event trên; publisher OTP hiện có vẫn xử lý riêng.

Order nhận từ queue durable `order.identity.events.v1` (single active consumer), ghi `Identity_User_Status` và `Processed_Events` cùng transaction. Event trùng được bỏ qua; revision cũ không ghi đè trạng thái mới. JSON hoặc contract sai bị từ chối sang `order.identity.events.v1.dlq`; lỗi DB dùng retry của listener rồi chuyển DLQ nếu vẫn thất bại. Hai service đều khai báo cùng topology để message có chỗ lưu kể cả khi Order chưa chạy.

Sau khi xác minh JWT, Order đọc trạng thái trong database riêng. Banned/Deactivated/Unverified trả HTTP 403 với mã ACCOUNT_BANNED/ACCOUNT_DEACTIVATED/ACCOUNT_UNVERIFIED; Active cho phép tiếp tục kiểm tra quyền nghiệp vụ. Tài khoản chưa có projection vẫn được kiểm tra JWT như trước. Không gọi Identity qua mạng ở bước này. Khi mở khóa, event Active cho phép token còn hạn tiếp tục sử dụng; đây không phải cơ chế thu hồi từng token.

## Cấu hình và triển khai

1. Database Order hiện có: áp dụng `database/order/migrations/002-identity-user-status.sql` trước khi chạy mã mới. Database mới dùng `database/order/schema.sql`, đã gồm bảng này. Không xóa hoặc tạo lại database hiện có.
2. Cấu hình hai service cùng RabbitMQ host, port, user, password và virtual host. Tài khoản broker cần quyền khai báo/publish/consume đúng topology; không public broker cho client.
3. Identity: `IDENTITY_EVENTS_PUBLISHER_ENABLED=true` (mặc định), `IDENTITY_EVENTS_PUBLISH_DELAY_MS=1000` (mặc định).
4. Order: `ORDER_IDENTITY_EVENTS_CONSUMER_ENABLED=true` (mặc định). Flag `ORDER_EVENTS_CONSUMER_ENABLED` chỉ điều khiển consumer Payment/Store, không điều khiển Identity.
5. Giữ cùng `JWT_SECRET`; cấu hình `IDENTITY_INTERNAL_API_KEY` cho REST tra cứu khách POS như trước.

Đồng bộ trạng thái là bất đồng bộ: khoảng trễ phụ thuộc polling/broker/consumer. Không hứa khóa có hiệu lực tức thì ngay lúc Identity trả response. Khi broker gián đoạn, request Order dùng trạng thái gần nhất đã nhận; event sẽ được retry sau. Theo dõi backlog, DLQ và event Pending.

Event chỉ được tạo cho thay đổi sau khi triển khai mã mới. Tài khoản đã khóa từ trước chưa tự có projection; cần phát lại lịch sử trạng thái phù hợp hoặc đồng bộ ban đầu qua API Identity nếu cần áp dụng với token cũ còn hạn. Không tự truy cập Identity DB từ Order. Chưa thực hiện backfill hoặc áp migration vào MySQL đang chạy trong đợt sửa mã này.

## Các file thay đổi

Identity (đường dẫn dưới `backend/identity-service/`):

- `src/main/java/com/smart_cafe_ai/identity_service/config/IdentityEventsConfig.java`: topology RabbitMQ mới.
- `src/main/java/com/smart_cafe_ai/identity_service/service/UserStatusEvents.java`: tạo event theo trạng thái, revision, transaction.
- `src/main/java/com/smart_cafe_ai/identity_service/service/UserStatusOutboxPublisher.java`: gửi outbox, confirm và retry.
- `src/main/java/com/smart_cafe_ai/identity_service/repository/OutboxEventRepository.java`: truy vấn riêng event trạng thái sẵn sàng gửi.
- `src/main/java/com/smart_cafe_ai/identity_service/repository/UserRepository.java`: đọc và khóa tài khoản ngay trong truy vấn xác minh OTP để phối hợp với cập nhật trạng thái.
- `src/main/java/com/smart_cafe_ai/identity_service/service/AdminUserService.java`: khóa User và tạo event khi cập nhật trạng thái.
- `src/main/java/com/smart_cafe_ai/identity_service/service/ManagerStaffService.java`: cùng xử lý cho trạng thái nhân viên.
- `src/main/java/com/smart_cafe_ai/identity_service/service/AuthService.java`: kích hoạt tài khoản phát event; verify OTP không cấp token cho tài khoản bị khóa.
- `src/main/resources/application.yaml`: cấu hình publisher trạng thái.
- `src/test/resources/application-test.yaml`: tắt publisher mới trong test.
- `src/test/java/com/smart_cafe_ai/identity_service/service/UserStatusEventsTest.java`: tính nguyên tử và thứ tự event.
- `src/test/java/com/smart_cafe_ai/identity_service/service/UserStatusOutboxPublisherTest.java`: confirm, retry, no-route.
- `src/test/java/com/smart_cafe_ai/identity_service/service/ChangeOtpFlowTest.java`, `GoogleLoginTest.java`, `RegistrationOtpChannelTest.java`, `StoreOwnershipBoundaryTest.java`: cập nhật constructor cho dependency event mới.

Order (đường dẫn dưới `backend/order-service/`):

- `src/main/java/com/smart_cafe_ai/order_service/config/IdentityEventsConfig.java`: queue/bindings/DLQ Identity.
- `src/main/java/com/smart_cafe_ai/order_service/model/IdentityUserStatus.java`: projection bền vững trong Order DB.
- `src/main/java/com/smart_cafe_ai/order_service/repository/IdentityUserStatusRepository.java`: đọc và khóa projection.
- `src/main/java/com/smart_cafe_ai/order_service/service/IdentityEventConsumer.java`: nhận message và kiểm tra contract.
- `src/main/java/com/smart_cafe_ai/order_service/service/IdentityEventService.java`: xử lý event idempotent và revision.
- `src/main/java/com/smart_cafe_ai/order_service/security/Access.java`: từ chối JWT theo trạng thái đã đồng bộ.
- `src/main/resources/application.yaml`: cấu hình consumer Identity riêng.
- `src/test/resources/application-test.yaml`: tắt listener trong test.
- `src/test/java/com/smart_cafe_ai/order_service/IdentityEventsApiTest.java`: JWT/API, duplicate, out-of-order, invalid payload, rollback.
- `README.md`: cập nhật hướng dẫn migration và flag consumer.

Database/tài liệu:

- `database/order/schema.sql`: thêm bảng cho database mới.
- `database/order/migrations/002-identity-user-status.sql`: thêm bảng vào database hiện có.
- `backend/IDENTITY_ORDER_INTEGRATION.md`: hợp đồng và danh sách thay đổi này.

## Kiểm thử

Các test dùng H2 và mock broker/dependency để kiểm tra mã mà không gửi email hay thay dữ liệu thật. Runtime production vẫn dùng MySQL và RabbitMQ, không chuyển sang H2/mock.

```powershell
mvn -f backend/identity-service/pom.xml test
mvn -f backend/order-service/pom.xml test
```

Phạm vi đợt sửa là Identity–Order. Không triển khai REST voucher/đổi tem Order–Engagement trong đợt này.

Kết quả kiểm thử ngày 2026-11-02: Identity 233 test, Order 35 test; tổng 268 test thành công, không lỗi hoặc bỏ qua. Chưa chạy kiểm thử liên thông qua broker/MySQL thật trong đợt này.
