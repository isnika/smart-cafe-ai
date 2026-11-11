# Order Service — Backend 1

Triển khai theo 20 endpoint trong sheet **4. Order** của `SmartAPI.xlsx` và các bảng Order trong `SmartCoffeeDT.sql`. Service chỉ ghi `smart_cafe_order_db`. Không truy vấn database Store/Payment/Inventory/Identity/Catalog trực tiếp.

## Chạy và tạo database

1. Database mới: chạy `database/order/schema.sql` bằng MySQL 8. Schema này đã bao gồm migration 001, 002 và 003.
2. Database đã tạo từ `SmartCoffeeDT.sql`: áp dụng các migration 001, 002, 003 trong `database/order/migrations/` còn thiếu theo thứ tự. Không chạy lại schema trên database hiện có.
3. Cấu hình datasource, JWT và kết nối nội bộ dưới đây; sau đó chạy:

```powershell
mvn -f backend/order-service/pom.xml spring-boot:run
```

Java target 17; module dùng constructor Java tường minh, không cần annotation processor. `ddl-auto=none` để giữ nguyên CHECK, generated columns và unique constraints của SQL gốc. Không dùng Hibernate update để thay migration.

| Biến môi trường | Ý nghĩa / mặc định |
|---|---|
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | MySQL Order; cấu hình credential thực tế trên máy |
| `JWT_SECRET` | Cùng secret ký access token của Identity/Gateway |
| `ORDER_INTERNAL_API_KEY` | Khóa bảo vệ API nội bộ Order; bắt buộc cấu hình |
| `STORE_INTERNAL_BASE_URL` | URL **kết thúc tại `/internal`** của Store, mặc định `http://localhost:8083/internal` |
| `STORE_INTERNAL_API_KEY` | Khớp khóa API chi nhánh nội bộ Store; `STORE_INTERNAL_AUTH_VALUE` cũ được giữ làm fallback cấu hình |
| `STORE_INTERNAL_AUTH_HEADER` | Header Store, mặc định `X-Service-Key` |
| `CATALOG_INTERNAL_BASE_URL` | `http://localhost:8082/internal/catalog` |
| `CATALOG_INTERNAL_API_KEY` | Khớp khóa nội bộ Catalog |
| `IDENTITY_INTERNAL_BASE_URL` | `http://localhost:8081/api/v1/internal` |
| `IDENTITY_INTERNAL_API_KEY` | Khớp khóa nội bộ Identity; chỉ cần khi POS gắn khách |
| `ORDER_PAYMENT_TIMEOUT_MINUTES` | `15`, thời hạn Pending_Payment |
| `ORDER_VAT_RATE` | `0` mặc định; ví dụ `0.08` nếu nghiệp vụ xác nhận VAT 8% đã nằm trong giá |
| `ORDER_EXPIRY_ENABLED` | `true`, tự hủy Pending_Payment hết hạn mỗi 30 giây |
| `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`, `RABBITMQ_VHOST` | Giống cấu hình RabbitMQ các service hiện có |
| `ORDER_EVENTS_PUBLISHER_ENABLED` | `true` |
| `ORDER_EVENTS_CONSUMER_ENABLED` | `false` mặc định; bật sau khi chốt exchange/payload với Backend 2 |
| `ORDER_IDENTITY_EVENTS_CONSUMER_ENABLED` | `true`; nhận trạng thái tài khoản từ Identity, độc lập với consumer Payment/Store |
| `ENGAGEMENT_INTERNAL_BASE_URL`, `ENGAGEMENT_INTERNAL_API_KEY` | REST Engagement, mặc định URL `http://localhost:8087/api/v1/internal`; key phải khớp Engagement |
| `ENGAGEMENT_RECOVERY_ENABLED` | `true`; phục hồi ưu đãi của checkout thất bại qua ledger |

Luồng JWT và trạng thái tài khoản Identity–Order được mô tả tại [IDENTITY_ORDER_INTEGRATION.md](../IDENTITY_ORDER_INTEGRATION.md).

Checkout voucher/đổi tem và cơ chế hoàn tác được mô tả tại [ORDER_ENGAGEMENT_INTEGRATION.md](../ORDER_ENGAGEMENT_INTEGRATION.md). `redeem_reward=true` miễn giá gốc một ly, topping vẫn tính tiền; `reward_item_index` tùy chọn để chọn dòng từ 0, mặc định chọn giá gốc dương thấp nhất.

Gateway đã có route `/api/v1/carts/**`, `/api/v1/orders/**` tới `ORDER-SERVICE`. Các service REST nội bộ gọi trực tiếp qua URL cấu hình; `/internal/**` bị Gateway hiện có chặn, kể cả discovery aliases. Không gọi API nội bộ thông qua Gateway. Client Web/Mobile/POS dùng cổng Gateway 8080; Order tự kiểm tra JWT, không tin các header role/user/branch do client gửi.

## Danh sách API

JSON snake_case, tiền VND nguyên, timestamp lưu UTC. Header `Authorization: Bearer <token>` cho tài khoản. QR dùng `X-Table-Session-Code`; giỏ QR và checkout cần thêm `X-Client-Key` (1–64 ký tự). Khóa thiết bị QR phải được client tạo ngẫu nhiên và lưu ổn định; không dùng chung giữa khách cùng bàn.

| Method | Đường dẫn | Quyền / xử lý |
|---|---|---|
| POST | `/api/v1/carts` | Customer Online hoặc Guest/Customer QR; 201 mới, 200 giỏ Active hiện có |
| GET | `/api/v1/carts/current?source=Online` | Giỏ hiện tại + giá Catalog mới nhất; source có thể QR |
| POST | `/api/v1/carts/current/items?source=Online` | Thêm dòng, kiểm tra Catalog và chi nhánh |
| PUT | `/api/v1/carts/current/items/{itemId}?source=Online` | Thay quantity/note/options; giữ variant |
| DELETE | `/api/v1/carts/current/items/{itemId}?source=Online` | Xóa dòng của giỏ hiện tại, 204 |
| DELETE | `/api/v1/carts/current?source=Online` | Chuyển Abandoned, 204 |
| POST | `/api/v1/orders` | Checkout cart Online/QR hoặc items POS, cần Idempotency-Key |
| GET | `/api/v1/orders/me` | Customer; lọc status/payment_status/from/to/page/size/sort |
| GET | `/api/v1/orders/me/{id}` | Đơn của chính Customer |
| GET | `/api/v1/orders/table-session` | Đơn thuộc phiên QR đã xác minh; lọc status |
| GET | `/api/v1/orders/table-session/{id}` | Chi tiết thuộc phiên QR |
| GET | `/api/v1/orders` | Staff/Manager trong chi nhánh; Admin toàn hệ thống |
| GET | `/api/v1/orders/{id}` | Staff/Manager theo phạm vi, Admin |
| PATCH | `/api/v1/orders/{id}/status` | Customer chủ đơn hủy Pending/Pending_Payment; Staff/Manager/Admin xử lý theo state machine |
| GET | `/api/v1/orders/{id}/history` | Customer chủ đơn hoặc nhân viên đúng chi nhánh |
| GET | `/api/v1/orders/summary` | Đếm theo status/source/fulfillment trong phạm vi nhân viên |
| GET | `/api/v1/orders/reports/sales` | Manager theo chi nhánh, Admin; from/to bắt buộc, group_by day/week/month |
| GET | `/api/v1/orders/reports/top-products` | Manager/Admin; from/to, limit 1–100 |
| GET | `/internal/orders/{id}` | X-Service-Key; snapshot cho service khác |
| GET | `/internal/orders/by-table-session/{tableSessionId}` | X-Service-Key; payment_status mặc định Unpaid, loại Cancelled/Rejected |

Internal cũng có alias `/api/v1/internal/orders`. GET danh sách nhân viên hỗ trợ `branch_id,status,payment_status,order_source,fulfillment_type,from,to,page,size,sort`. page bắt đầu 1, size 1–100. Sort whitelist: `id,created_at,updated_at,completed_at,final_amount,status,order_code`; ví dụ `created_at,desc`. `from/to` chấp nhận ngày hoặc timestamp ISO; timestamp không offset được hiểu UTC. Báo cáo dùng **completed_at UTC**, ngày đầu/cuối bao gồm, tối đa 367 ngày. Tuần bắt đầu thứ Hai. Đây là doanh số đơn Completed, chưa trừ hoàn tiền thực thu của Payment. Top products gom theo variant và cộng line_total (bao gồm options, sau item discount), chưa phân bổ voucher/fee. Báo cáo hiện tổng hợp trong bộ nhớ trong khoảng ngày giới hạn; khi dữ liệu lớn cần đẩy aggregation xuống SQL/read-model.

Ví dụ tạo giỏ và thêm món:

```json
{"cart_source":"Online","branch_id":1,"fulfillment_type":"Pickup"}
```

```json
{"variant_id":1,"quantity":2,"note":"Ít ngọt","options":[{"option_id":5,"quantity":1}]}
```

Checkout (`Idempotency-Key: <UUID>`):

```json
{"cart_id":1,"order_source":"Online","fulfillment_type":"Pickup","branch_id":1,"payment_method":"VNPay","note":"Nhận tại quầy"}
```

`payment_method` là trường command bổ sung vì Excel đề cập VNPay/Momo nhưng body chưa có cách chọn. VNPay/Momo tạo Pending_Payment; bỏ trống/Cash/COD tạo Pending. COD chỉ dành Delivery; Cash chỉ Pickup/Dine_In. Trường này chỉ quyết định trạng thái khởi tạo; **Order không tạo giao dịch/link thanh toán**, client tiếp tục gọi Payment Service. Không tin giá/discount/payment_status từ client. Checkout Delivery cần delivery_name/phone/address/latitude/longitude và phải nằm trong bán kính chi nhánh. Phí lấy từ Store, không nhận client tự tính.

Đổi trạng thái:

```json
{"status":"Confirmed","version":0,"note":"Đã nhận đơn"}
```

`cancel_reason` bắt buộc khi Cancelled/Rejected. `version` lấy từ response mới nhất, kể cả sau Payment event. Luồng chuẩn: Pending → Confirmed → Preparing → Ready; Delivery tiếp tục Shipping → Completed; Pickup → Completed; Dine_In → Served → Completed. Completed yêu cầu Paid, chưa hoàn tiền. Customer chỉ hủy Pending/Pending_Payment. Trạng thái cuối không mở lại. Rejected cũng phát order.cancelled để giải phóng reservation. Không có workflow yêu cầu hủy chờ duyệt trong DB gốc.

Checkout khóa giỏ; tạo order/items/history/outbox và chuyển Converted trong cùng transaction. Cùng Idempotency-Key + cùng owner/nội dung trả 200 snapshot đơn cũ; khác nội dung/owner trả 409 IDEMPOTENCY_CONFLICT. Trong tranh chấp INSERT/unique, một request có thể trả 409 CONFLICT; retry cùng key sau khi transaction kia commit sẽ lấy đơn cũ. Replay không đổi giá snapshot. Giỏ Active khác chi nhánh/hình thức trả CART_CONTEXT_CONFLICT; bỏ giỏ trước khi đổi.

## NOTE bàn giao Backend 2

Store đã có `GET /internal/branches/{id}` và kiểm tra `X-Service-Key`. Các URL phiên bàn/hồ sơ nhân viên dưới đây vẫn cần đối chiếu với Backend 2; BranchResponse hiện chưa có tọa độ để kiểm tra bán kính Delivery. Tất cả cần trả envelope `{"success":true,"data":...}` và dùng credential nội bộ; không trả dữ liệu giả khi service lỗi. Xem [COMMERCE_REAL_INTEGRATION.md](../COMMERCE_REAL_INTEGRATION.md) để chạy và kiểm tra bằng MySQL/REST thật.

| Store endpoint (sau STORE_INTERNAL_BASE_URL) | data tối thiểu |
|---|---|
| GET `/branches/{id}` | `id,status,accepts_online_orders,delivery_fee,delivery_radius_km,latitude,longitude,timezone,opening_time,closing_time` |
| GET `/table-sessions/by-code/{code}` | `id,branch_id,status,expires_at` — branch_id compose từ Tables |
| GET `/table-sessions/{id}` | Cùng shape; POS Dine_In dùng lookup này |
| GET `/staff-profiles/by-user/{userId}` | `user_id,branch_id,status` — lấy từ Store.Staff_Profiles, không lấy branch_id client |

Giờ mở cửa/đóng cửa có thể null, hai giờ bằng nhau hiểu mở cả ngày; ca qua nửa đêm được hỗ trợ. Phiên Active mới nhận đơn; Payment_Pending chỉ đọc; Completed/Cancelled/expired bị chặn. Staff/Manager phải có profile Active. Admin được truy cập các chi nhánh. Nếu chưa cấu hình, trả **503 STORE_INTEGRATION_NOT_CONFIGURED**, sai response/broker HTTP lỗi trả STORE_UNAVAILABLE. JWT branch claim chưa thay thế việc xác minh profile Store.

| Service Backend 2 | Công việc tích hợp cần làm |
|---|---|
| Payment | Tạo giao dịch/link qua API Payment riêng; phát payment.succeeded/failed/expired/refunded theo payload bên dưới; dùng Order internal snapshots để settlement; chịu trách nhiệm chống thu quá tiền xuyên service và hoàn tiền nếu thanh toán đến sau khi Order đã Cancelled/Rejected |
| Inventory | Bind queue riêng vào smart-cafe.order; order.created → reserve, order.cancelled (kể cả Rejected) → release, order.completed → commit. Xử lý idempotent, tính recipe + options theo quantity. Hiện Catalog kiểm tra availability, **chưa có synchronous reservation/ack bảo đảm không oversell**; cần chốt saga/reservation thất bại trước khi vận hành tải đồng thời |
| Store | Bốn lookup trên; phát store.table_session.closed; đồng bộ khóa/đóng phiên với checkout để giải quyết cửa sổ race giữa REST lookup và commit. Order kiểm tra Store mỗi command; closed event bỏ các giỏ QR Active |
| Intelligence | Consume order.completed, dữ liệu items snapshot; Order không cần gọi AI khi checkout |

Mặc định consumer inbound tắt để chưa nhận payload chưa được thống nhất. Bật `ORDER_EVENTS_CONSUMER_ENABLED=true` khi Backend 2 sẵn sàng. Publisher vẫn ghi outbox khi chưa có consumer; event không có route được giữ Pending và retry. Để phát đầy đủ cho mọi service, từng consumer phải có durable queue/binding và Processed_Events riêng; broker confirm chỉ xác nhận có route, không bảo đảm mọi consumer đều đã triển khai.

## RabbitMQ contract

Outbound exchange `smart-cafe.order` (topic, durable), routing key: `order.created`, `order.status_changed`, `order.completed`, `order.cancelled`. Payload có `event_id,event_type,event_version=1,occurred_at,order_id,order_code,user_id,branch_id,table_session_id,status,payment_status,expires_at,from_status,previous_status,changed_by,note,cancel_reason`, amounts và items snapshot. Mỗi item có `order_item_id,product_id,variant_id,quantity,unit_price,options_unit_total,is_reward_item,options[{option_id,quantity,unit_price,...}]`. Thông tin địa chỉ/điện thoại giao không broadcast; service cần thông tin này gọi API nội bộ đã xác thực.

Inbound exchange `smart-cafe.payment` (topic, durable):

```json
{"event_id":"UUID","event_type":"payment.succeeded","payment_id":10,"branch_id":1,"payment_method":"VNPay","amount":80000,"allocations":[{"order_id":1,"allocated_amount":80000}],"paid_at":"2026-10-31T10:00:00Z"}
```

```json
{"event_id":"UUID","event_type":"payment.refunded","refund_id":20,"payment_id":10,"amount":30000,"allocations":[{"order_id":1,"amount":30000,"restock_inventory":true,"reverse_loyalty":true}]}
```

`amount` tổng phải bằng tổng allocations; số tiền nguyên dương; một order chỉ xuất hiện một lần/event, tối đa 100 allocations. payment.failed/expired có `event_id,payment_id,allocations[{order_id}],reason/expired_at`. Failed giữ trạng thái; Expired chỉ hủy Pending_Payment nếu deadline Order đã đến, tránh payment attempt cũ hủy đơn mới. Scheduler Order cũng tự hết hạn độc lập.

Inbound exchange `smart-cafe.store`: `store.table_session.closed` với `event_id,table_session_id,status=Completed|Cancelled`; `store.branch.status_changed` được ghi nhận idempotent, không dùng cache thay lookup trực tiếp.

Queue `order.payment.events.v1`, `order.store.events.v1`; DLX `smart-cafe.order.dlx` (direct), routing key trùng tên queue; DLQ tương ứng thêm `.dlq`. Retry 3 lần rồi giữ trong DLQ. Sau khi sửa contract/thứ tự sự kiện, replay đúng routing key gốc và giữ event_id; không xóa Processed_Events để chạy lại tác vụ đã commit. Consumer giao dịch atomic, khóa các order theo ID tăng dần, dedupe event_id và cả payment/refund business ID. Nhiều thanh toán cộng dồn đủ mới Paid/Pending; refund chuyển Partially_Refunded/Refunded. Refund đến trước payment cần replay sau payment. Đơn hủy không tự mở lại khi tiền đến muộn.

Outbox dùng persistent messages, mandatory routing + publisher confirm; mất kết nối/nack/no-route giữ Pending và backoff tối đa 300s. Phát theo thứ tự ID trong cùng order; cơ chế at-least-once nên consumer luôn cần dedupe. Trường hợp commit DB sau broker ACK thất bại sẽ phát lại đúng event_id.

## Phần còn thiếu ngoài Order

**Engagement thuộc Backend 1**, đã nối REST áp voucher/đổi tem và bổ sung ledger hoàn tác checkout. Request có voucher_code/redeem_reward yêu cầu khách có tài khoản và khóa nội bộ hợp lệ; thiếu cấu hình trả 503 ENGAGEMENT_INTEGRATION_NOT_CONFIGURED. Không nhận discount do client tự nhập. Xem ORDER_ENGAGEMENT_INTEGRATION.md để áp dụng migration 003 của hai service và kiểm tra luồng thật. Catalog resolve vẫn cần Store có chi nhánh hợp lệ.

Migration 001 bổ sung request_hash/request_owner để bảo vệ replay và bảng local Order_Payment_Entries để cộng dồn/dedupe allocations. Đơn có trước migration chưa có allocation ledger; cần backfill từ Payment trước khi replay refund/payment lịch sử. Hai cột request metadata null của đơn cũ không được replay như yêu cầu mới.

## Kiểm thử

```powershell
mvn -f backend/order-service/pom.xml test
```

MockMvc + H2, mock các dependency chỉ trong test; kiểm tra API, snapshot, transaction/checkout đồng thời, phân quyền, state/version, payment/refund/dedupe/expiry. HTTP adapter test chạy HTTP server local để kiểm tra contract. Unit test publisher kiểm tra confirm/nack/no-route/retry; không cần RabbitMQ, Store hoặc MySQL thật. H2 không thay cho kiểm thử collation/generated columns/locking trên MySQL và luồng end-to-end với Backend 2. Postman collection tại `postman/order-service.postman_collection.json`; đặt token, cart_id/order_id/tableSessionCode/clientKey theo dữ liệu thật.
