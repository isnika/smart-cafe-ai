# Engagement Service — API và tích hợp

Service: `8087`; database: `smart_cafe_engagement_db`; tiền VND nguyên, thời gian UTC.
Đã bổ sung 21 API theo SmartAPI/đặc tả Engagement và một API hoàn tác checkout nội bộ. Luồng gửi OTP và
`GET /api/v1/internal/notifications/{eventId}` được giữ riêng, dùng hợp đồng cũ.

## Cấu hình và database

1. Chạy lần lượt `database/engagement/001_baseline.sql` và
   `database/engagement/002_preserve_otp_and_extend.sql`, sau đó
   `database/engagement/003_order_benefit_state.sql` bằng MySQL Workbench.
   Script không xóa bảng/dữ liệu; có thể chạy lại. Script 002 giữ dữ liệu OTP,
   bổ sung metadata và cho phép thông báo In_App không có địa chỉ email/hạn OTP.
   Trên MySQL phân biệt hoa/thường, tên bảng của module này là chữ thường.
2. Trong `engagement-service/.env`, đặt `JWT_SECRET` **giống khóa ký của Identity**.
   Không có khóa mặc định cho môi trường chạy thật. Dùng Base64 của ít nhất 32 byte.
   Chưa đặt JWT_SECRET thì OTP vẫn chạy; API cần JWT trả 503 khi nhận Bearer token,
   không chấp nhận token bằng một khóa dự phòng.
   Đặt `ENGAGEMENT_INTERNAL_API_KEY` là bí mật riêng cho các command nội bộ.
   `NOTIFICATION_INTERNAL_TOKEN` tiếp tục chỉ dùng cho API chẩn đoán OTP.
3. Từ thư mục `backend`: `mvn -pl engagement-service spring-boot:run`.
   Cần MySQL, RabbitMQ; discovery server nếu gọi qua Gateway.

Gateway đã có đủ 5 route public. `/internal/**` bị chặn tại Gateway, kể cả route
discovery; Order phải gọi trực tiếp `http://localhost:8087/api/v1/internal/...`
với `X-Service-Key: <ENGAGEMENT_INTERNAL_API_KEY>`. JWT Customer không thay thế khóa này.

## Danh mục 22 API

Các path dưới đây có tiền tố `/api/v1`.

| Method | Path | Quyền |
|---|---|---|
| GET | `/loyalty/me` | Customer |
| GET | `/loyalty/me/transactions` | Customer |
| POST | `/loyalty/adjustments` | Manager/Admin |
| POST | `/internal/loyalty/redeem` | Service key |
| POST | `/internal/benefits/reverse` | Service key; bù checkout thất bại |
| GET | `/vouchers/available` | Customer |
| POST | `/vouchers/validate` | Customer |
| POST | `/internal/vouchers/apply` | Service key |
| GET | `/vouchers` | Manager/Admin |
| POST | `/vouchers` | Manager/Admin |
| PUT | `/vouchers/{id}` | Manager/Admin |
| PATCH | `/vouchers/{id}/status` | Manager/Admin |
| POST | `/reviews` | Customer |
| GET | `/reviews` | Public; bắt buộc `product_id` |
| GET | `/reviews/me` | Customer |
| GET | `/reviews/admin` | Manager/Admin |
| PATCH | `/reviews/{id}/status` | Manager/Admin |
| POST | `/device-tokens` | Customer |
| DELETE | `/device-tokens/{id}` | Customer |
| GET | `/notifications/me` | Customer |
| PATCH | `/notifications/{id}/read` | Customer |
| POST | `/notifications/read-all` | Customer |

JWT: `Authorization: Bearer <access_token>`, chủ sở hữu lấy từ `sub`, role từ
claim `role`. Manager quản lý voucher/review của `branch_id` trong JWT, Admin
quản lý tất cả chi nhánh. Manager không được sửa voucher toàn hệ thống.
Điều chỉnh tem là quyền Manager/Admin trên user theo đặc tả.

Response mới: `{"success":true,"data":...,"meta":...,"trace_id":"..."}`.
Lỗi: `{"success":false,"error":{"code":"...","message":"...","details":[]},"trace_id":"..."}`.
`X-Trace-Id` được truyền lại trong header. API OTP nội bộ vẫn trả response cũ.

Danh sách có phân trang: `page=1&size=20`, size tối đa 100.
Loyalty transactions: `transaction_type=Earn|Redeem|Reversal|Adjustment`, sort
`created_at|id|stamps,asc|desc`. Reviews: sort `created_at|id|rating,asc|desc`.
Notifications: `is_read`, `type`, sort `created_at|sent_at|id,asc|desc`.
Voucher admin: `status`, `branch_id`. Review me/admin: `status`; admin thêm `product_id`.

## Ví dụ body

Điều chỉnh tem, hỗ trợ header `Idempotency-Key` tùy chọn:

```json
{"user_id":"UUID-CUSTOMER","stamps":20,"note":"Bù tem giao dịch trước"}
```

Đổi thưởng nội bộ, luôn trừ đúng 10 tem; thiếu tem trả 422 `INSUFFICIENT_STAMPS`:

```json
{"user_id":"UUID-CUSTOMER","order_id":1001,"idempotency_key":"order-1001-reward"}
```

Tạo voucher (PUT dùng cùng các trường, giữ nguyên code):

```json
{
  "code":"CAFE20","name":"Giảm 20%","discount_type":"Percent",
  "discount_value":20,"max_discount_amount":20000,"min_order_amount":50000,
  "branch_id":1,"applicable_fulfillment":"All",
  "starts_at":"2026-11-01T00:00:00Z","ends_at":"2026-12-01T00:00:00Z",
  "usage_limit_total":100,"usage_limit_per_user":1,"status":"Active"
}
```

Validate không ghi lượt dùng; voucher không hợp lệ trả 200 với `valid=false` và `reason`:

```json
{"code":"CAFE20","branch_id":1,"fulfillment_type":"Pickup","order_amount":100000}
```

Apply nội bộ dùng body validate, thêm `user_id`, `order_id`. Lần đầu trả 201,
retry cùng dữ liệu trả 200; thay dữ liệu trên cùng voucher/order trả 409.
Quota được kiểm tra khi giữ khóa voucher, giảm giá không vượt giá trị đơn;
phần trăm làm tròn xuống VND. PATCH voucher status: `{"status":"Inactive"}`.

Review: `{"order_item_id":101,"product_id":10,"rating":5,"comment":"Ngon"}`.
Chỉ nhận khi đúng bộ order item/user/product trong Verified_Purchases, mỗi item/user
một review. Ban đầu `Pending`, public chỉ thấy `Approved`. PATCH status nhận
`{"status":"Approved"}` hoặc `{"status":"Hidden"}` và lưu người/thời điểm duyệt.

Token: `{"platform":"Web","token":"push-token"}`; platform `iOS|Android|Web`.
Đăng ký lại cùng chủ sở hữu cập nhật `last_seen_at`/kích hoạt lại. Token thuộc
tài khoản khác trả 409. DELETE đặt `is_active=false`; response không lộ token.

Đọc thông báo: `{"is_read":true}`; chỉ thao tác trên chính user.
Read-all trả `{"updated_count":N}`. Response không lộ recipient, lỗi SMTP hay metadata OTP.

## Sự kiện và các quyết định triển khai

- Queue `engagement.domain.events.v1` nhận `order.completed`, `order.cancelled`,
  `order.status_changed` từ `smart-cafe.order`; `payment.refunded`, `payment.failed`,
  `invoice.issued` từ `smart-cafe.payment`. Chấp nhận JSON phẳng của Order hiện tại
  hoặc envelope `{event_id,event_type,event_version,payload}`. Chỉ hỗ trợ version 1.
- Processed_Events, cập nhật nghiệp vụ và Outbox_Events commit trong cùng transaction.
  Event lỗi rollback toàn bộ; Rabbit thử lại rồi giữ tại `engagement.domain.events.v1.dlq`.
  Không tự xóa DLQ nghiệp vụ. Không truy cập database service khác.
- Publisher phát `engagement.loyalty.earned|redeemed|reversed` và
  `engagement.review.created` qua `smart-cafe.engagement`, có publisher confirm,
  mandatory return, retry và event ID ổn định. Consumer nhận cần tự chống trùng.
  Chưa có queue đích thì outbox giữ Failed và thử lại; không coi là đã giao thành công.
- Loyalty card tạo khi đọc lần đầu/ghi nghiệp vụ. Khóa card + version ngăn chi tiêu
  cạnh tranh; ràng buộc unique ngăn nhiều Earn/Redeem cho cùng đơn. Tranh chấp tạo
  card lần đầu hoặc deadlock có thể trả 409; gọi lại cùng idempotency key.
- `order.completed` tạo Verified_Purchases, lấy thời gian lần lượt từ `purchased_at`,
  `completed_at`, `occurred_at`; LocalDateTime từ Order được hiểu là UTC.
  Mỗi quantity của item không phải reward được cộng một tem; có thể loại món không
  phải đồ uống bằng `loyalty_eligible=false`. Đây là giả định cho menu đồ uống hiện tại.
  Thiếu `is_reward_item` thì không tự đoán mà rollback vào retry/DLQ.
- Giữ đúng CHECK SQL: một Earn/order, tối đa 50 tem. Đơn trên 50 ly được rollback
  và giữ DLQ để xử lý chính sách/schema, không âm thầm cắt số tem. Guest không có
  user_id không được tích tem và không tạo quyền review.
- `order.cancelled` đảo Earn/Redeem, hoàn quota voucher một lần. `payment.refunded`
  chỉ đảo toàn bộ loyalty/voucher của allocation khi `reverse_loyalty=true`;
  không tự tính tỷ lệ theo tiền hoàn. Producer phải đặt cờ theo chính sách hoàn tiền.
  Balance cho phép tới -100; đảo tiếp vượt giới hạn sẽ rollback/DLQ.
- Order_Benefit_State serialize apply/redeem và complete/cancel/refund. Khi reversal
  đã được ghi, request checkout hoặc completed đến muộn không được chi tiêu/tích tem lại.
  Cùng request thành công có thể replay sau Completed; không cho thêm command mới.
- Review: Pending→Approved/Hidden, Approved→Hidden; không mở lại Hidden.
  Phát `engagement.review.created` khi duyệt Approved lần đầu.
- Thông báo mới dùng In_App. `payment.failed`/`invoice.issued` dùng user_id được
  cung cấp hoặc user từ Verified_Purchases cục bộ. Nếu không xác định được tài khoản,
  ghi log bỏ qua; không tra cứu Identity bằng email. Chưa gửi push qua FCM/APNs hay
  email hóa đơn; chức năng gửi email OTP vẫn hoạt động như trước.

## Phạm vi tích hợp Order

Order đã gọi REST thật để áp voucher và đổi tem khi checkout. Thêm API nội bộ
`POST /api/v1/internal/benefits/reverse` nhận `{"user_id":"...","order_id":123}`,
dùng cùng X-Service-Key, trả `{"order_id":123,"status":"Reversed"}` trong data.
API idempotent này phục vụ bù checkout thất bại. Order lưu ledger độc lập và retry
reversal khi mạng/service lỗi; Engagement lưu Order_Benefit_State để chặn request
redeem/apply đến muộn sau hoàn tác. Checkout miễn giá gốc một ly; topping vẫn trả tiền.
Xem [ORDER_ENGAGEMENT_INTEGRATION.md](../ORDER_ENGAGEMENT_INTEGRATION.md) về quy tắc
chọn món thưởng, công thức tính giá, migration 003 của hai database và phạm vi kiểm chứng.

## Kiểm thử

Từ repository root: `mvn -f backend/engagement-service/pom.xml test`.
Test profile dùng H2, khóa JWT riêng cho test, mock mail, tắt consumer/publisher;
không gửi thư thật. Bộ test kiểm tra các route mới, quyền/ownership, moderation,
quota/retry, transaction rollback, reversal và đổi thưởng đồng thời, cùng test OTP cũ.
