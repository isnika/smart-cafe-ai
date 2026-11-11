# Order ↔ Engagement: REST và event

Runtime dùng REST HTTP thật, MySQL riêng từng service và RabbitMQ. Không có fallback giá/voucher/tem giả. Order không đọc database Engagement và Engagement không đọc database Order.

## Checkout

`POST /api/v1/orders` giữ các trường cũ và nhận thêm `reward_item_index` tùy chọn (chỉ số dòng, bắt đầu 0):

```json
{
  "cart_id": 123,
  "order_source": "Online",
  "fulfillment_type": "Pickup",
  "branch_id": 1,
  "voucher_code": "SAVE20",
  "redeem_reward": true,
  "reward_item_index": 0,
  "payment_method": "VNPay"
}
```

Các ID và mã ở ví dụ phải thay bằng dữ liệu đã có. Header `Idempotency-Key` vẫn bắt buộc. Online lấy user_id từ JWT; POS chỉ gắn khách đã được Identity xác minh. Guest không được dùng voucher/tem.

- Giá lấy từ Catalog khi checkout, không nhận giá hoặc discount do client tự nhập.
- Đổi 10 tem miễn **giá gốc đúng một ly**, topping vẫn tính tiền theo SQL hiện có. Nếu dòng chọn có quantity >1, tách một ly thành dòng `is_reward_item=true`, quantity=1; các ly còn lại giữ dòng bình thường.
- Nếu không chỉ định reward_item_index, chọn dòng có giá gốc dương thấp nhất; cùng giá chọn dòng xuất hiện trước. Đây là quy tắc mặc định bổ sung vì hợp đồng cũ chỉ có redeem_reward boolean. Chỉ số dòng Online/QR theo thứ tự items giỏ hàng (ID tăng dần); POS theo items gửi lên.
- Menu hiện chưa có cờ phân loại món đủ điều kiện loyalty. Quy tắc hiện tại giữ giả định menu đồ uống như phần tích tem trước đây; không tự suy diễn thuộc tính Catalog chưa cung cấp.
- Voucher áp trên `sub_total - item_discount_amount`, không áp trên phí giao hàng. Có thể dùng voucher và reward cùng đơn nếu voucher hợp lệ với số tiền sau giảm món.
- `final_amount = sub_total - item_discount_amount - voucher_discount_amount + delivery_fee`; VAT là phần đã bao gồm trong tổng. Tổng bằng 0 được Paid và không chờ cổng thanh toán.
- Cùng key + cùng request trả snapshot đơn đã commit, không trừ tem/áp voucher lần nữa. Request có reward_item_index=null giữ cách tính hash cũ để tương thích retry đơn trước đợt sửa.

Order gọi bằng X-Service-Key:

| Endpoint Engagement (sau base URL) | Nghiệp vụ |
|---|---|
| POST `/loyalty/redeem` | user_id, order_id, idempotency_key=`order:<id>:reward` |
| POST `/vouchers/apply` | code, user_id, order_id, branch_id, fulfillment_type, order_amount |
| POST `/benefits/reverse` | user_id, order_id; API bổ sung để bù checkout thất bại |

Base mặc định `http://localhost:8087/api/v1/internal`. API reverse được bảo vệ cùng service key, không đưa qua Gateway. Client chấp nhận 200 replay/201 created, kiểm tra ID, loại giao dịch, trạng thái và discount; retry tối đa hai lần với cùng identity khi lỗi mạng/5xx. Business rejection không được thay bằng giá trị 0 để tạo đơn không đúng ưu đãi.

## Hoàn tác khi checkout lỗi

1. Order kiểm tra dữ liệu, tạo Order/items trong transaction chưa commit để lấy ID và kiểm tra ràng buộc local.
2. Trước lần gọi thay đổi dữ liệu Engagement đầu tiên, ghi `Engagement_Checkouts` trong transaction REQUIRES_NEW. Ledger không có FK đến Order chưa commit và sống qua rollback.
3. Gọi redeem/apply. Chỉ sau khi nhận và kiểm tra kết quả mới lưu số tiền cuối, chuyển giỏ Converted và ghi order.created trong transaction Order.
4. Sau khi transaction kết thúc, recovery đọc Order bằng transaction mới. Order đã commit → ledger Committed. Không có Order → gọi reverse; thành công → Reversed.
5. Nếu gọi reverse thất bại, ledger vẫn Pending, có backoff và scheduled retry mỗi 30 giây. Nếu tiến trình dừng trước callback, ledger chưa xử lý được kiểm tra lại sau 10 phút. Transaction checkout có timeout 60 giây, HTTP mỗi lần tối đa 4 giây; khoảng chờ recovery tránh đảo một checkout đang xử lý bình thường.

Engagement có `Order_Benefit_State` khóa theo order_id để serialize apply/redeem/complete/reverse. Reverse ghi trạng thái Reversed kể cả khi request trước đó chưa tới. Vì thế request redeem/apply đến muộn sau timeout không thể trừ lại tem/chiếm lại quota. Reverse lặp chỉ hoàn tác transaction gốc/quota một lần.

Đây là nhất quán cuối cùng giữa hai database: nếu Engagement đang offline, hoàn tác chưa thể xảy ra tức thì. Theo dõi ledger Pending/last_error/retry_count. Không xóa ledger hoặc reset auto increment Order khi vẫn còn request/recovery; bảo đảm pool kết nối đủ cho transaction checkout và transaction recovery độc lập.

## Các event

- Order giữ transactional outbox, publisher confirms và retry cho `order.completed`, `order.cancelled`, `order.status_changed`.
- Completed: Engagement chống event trùng, tạo Verified_Purchases và Earn cho quantity không phải reward; món thưởng không tích tem.
- Cancelled/refund có reverse_loyalty=true: chung cơ chế khóa và đảo loyalty/voucher. Nếu cancel/refund tới trước completed, trạng thái Reversed ngăn tích tem muộn.
- Status changed: thông báo In_App cho user có tài khoản; không tự gửi email/FCM ngoài phạm vi hiện có. OTP giữ luồng riêng.
- SQL loyalty hiện giới hạn một Earn/order và 1–50 tem; đơn vượt giới hạn vẫn cần chính sách/schema riêng như API.md đã ghi. Không âm thầm cắt tem.

Order đã có GET `/api/v1/internal/orders/{id}` cho tra cứu snapshot bằng key. Review Engagement tiếp tục dựa vào Verified_Purchases nhận qua event, không thêm request tra cứu Order ở mỗi review.

## Cấu hình / migration

Order:

```dotenv
ENGAGEMENT_INTERNAL_BASE_URL=http://localhost:8087/api/v1/internal
ENGAGEMENT_INTERNAL_API_KEY=<khóa khớp Engagement>
ENGAGEMENT_RECOVERY_ENABLED=true
```

Engagement: `ENGAGEMENT_INTERNAL_API_KEY` cùng giá trị và `JWT_SECRET` khớp Identity để API khách hàng nhận token thật. Giữ cấu hình SMTP và broker hiện có.

Áp dụng migration bổ sung, không chạy lại baseline trên database hiện có:

- Order DB: `database/order/migrations/003-engagement-checkouts.sql`.
- Engagement DB: `database/engagement/003_order_benefit_state.sql`.

Database Order mới dùng schema.sql đã có ledger. Engagement mới áp baseline/extension trước rồi migration 003. Runtime giữ MySQL/RabbitMQ; test profile H2/mock chỉ để cô lập kiểm thử, không phải nguồn dữ liệu production.

Store hiện chưa có chi nhánh và người dùng đã chọn tự bổ sung chi nhánh sau. Không tự tạo chi nhánh, voucher, user hay số dư tem mẫu để kiểm tra thành công checkout trên dữ liệu thật. Kiểm tra tích hợp thành công cần branch/product/customer/voucher/balance thật phù hợp.

## File sửa/thêm trong đợt này

Order:

- `src/main/java/com/smart_cafe_ai/order_service/service/OrderService.java`: ghép REST vào checkout, chọn/tách món thưởng, tính tiền và callback recovery.
- `src/main/java/com/smart_cafe_ai/order_service/dto/Requests.java`: reward_item_index tùy chọn.
- `src/main/java/com/smart_cafe_ai/order_service/integration/EngagementClient.java`, `HttpEngagementClient.java`: hợp đồng và HTTP client thật.
- `src/main/java/com/smart_cafe_ai/order_service/model/EngagementCheckout.java`, `repository/EngagementCheckoutRepository.java`: ledger bền vững.
- `src/main/java/com/smart_cafe_ai/order_service/service/EngagementCheckoutRecovery.java`, `EngagementRecoveryScheduler.java`: hoàn tác và phục hồi sau restart.
- `src/main/resources/application.yaml`, `src/test/resources/application-test.yaml`: cấu hình REST/recovery.
- `src/test/java/com/smart_cafe_ai/order_service/HttpEngagementClientTest.java`, `OrderApiTest.java`: HTTP contract, tính tiền, retry, lỗi và recovery.
- `src/test/java/com/smart_cafe_ai/order_service/OrderCatalogLiveIT.java`: tắt recovery trong bài kiểm tra live chỉ đọc.
- `src/test/java/com/smart_cafe_ai/order_service/OrderEngagementLiveIT.java`: kiểm tra bean HTTP production gọi service Engagement/MySQL thật, không tạo dữ liệu mẫu.
- `README.md`: hướng dẫn checkout và migration.

Engagement:

- `src/main/java/com/smart_cafe_ai/engagement_service/model/OrderBenefitState.java`, `repository/OrderBenefitStateRepository.java`: trạng thái/khóa ưu đãi của đơn.
- `src/main/java/com/smart_cafe_ai/engagement_service/service/OrderBenefitGuard.java`, `OrderBenefitService.java`: chống request muộn, reversal chung.
- `src/main/java/com/smart_cafe_ai/engagement_service/service/LoyaltyService.java`, `VoucherService.java`: khóa theo đơn trước apply/redeem; vẫn replay request cũ sau Completed nhưng chặn command mới.
- `src/main/java/com/smart_cafe_ai/engagement_service/service/EngagementEventService.java`: tích hợp trạng thái ưu đãi với complete/cancel/refund.
- `src/main/java/com/smart_cafe_ai/engagement_service/dto/Requests.java`, `controller/EngagementController.java`: API reverse nội bộ.
- `src/test/java/com/smart_cafe_ai/engagement_service/EngagementApiTest.java`: hoàn tác, chống request muộn và thứ tự checkout trước completed.
- `API.md`: cập nhật contract/tình trạng tích hợp.

Ngoài module: hai migration 003, `database/order/schema.sql`, tài liệu này và cập nhật tài liệu commerce trước đó. Các `.env` local có credential không được commit.

## Kết quả kiểm chứng ngày 2026-11-02

- Order: 48 test; Engagement: 25 test; 73 test thành công, không lỗi hoặc bỏ qua (không tính các LiveIT opt-in đã chạy ở đợt trước).
- `OrderEngagementLiveIT`: thêm 1 test thành công. Bean HttpEngagementClient thật gọi Engagement đang chạy bằng key thật và tài khoản Customer hiện có; voucher cố ý không tồn tại trả 422 BUSINESS_RULE_VIOLATION. Chỉ xác nhận kết nối/contract lỗi, không coi là áp voucher/checkout thành công.
- Đã áp hai migration 003 vào MySQL, cấu hình khóa nội bộ/JWT trong các .env local, build và khởi động lại Order 8084/Engagement 8087. Không tạo chi nhánh, voucher, đơn hoặc số dư tem mẫu.
- Kiểm tra MySQL sau LiveIT: không còn bản ghi order_benefit_state cho request bị từ chối; ledger Engagement_Checkouts trống.
- RabbitMQ thật: engagement.domain.events.v1 và engagement.otp.email mỗi queue có 1 consumer, không còn message ready/unacked tại thời điểm kiểm tra.
- Store Branches vẫn có 0 bản ghi. Chưa xác nhận toàn bộ checkout thành công trên dữ liệu thật; cần chi nhánh và dữ liệu nghiệp vụ hợp lệ do người dùng cung cấp. Không tự thêm dữ liệu để bỏ qua điều kiện này.
