# Gửi OTP qua email

Luồng: Identity Service → Outbox_Events (DB Identity) → RabbitMQ → OtpEmailConsumer → NotificationService → EmailService → SMTP.

Identity sinh, băm, lưu và xác minh OTP. Mặc định không in mã ra log; chỉ bật `OTP_LOG_CODES=true` khi debug cục bộ. Engagement không truy cập database Identity; chỉ giữ `user_id` như một tham chiếu. `EmailService` chỉ dựng/gửi email, `NotificationService` quản lý trạng thái, `NotificationRepository` lưu bảng `Notifications` trong `smart_cafe_engagement_db`.

## 1. Chuẩn bị

- Java 17 và MySQL đang chạy. RabbitMQ có thể cài trực tiếp trên Windows hoặc chạy bằng Docker; các service Java vẫn chạy trực tiếp bằng IDE/Maven.
- Tạo database riêng nếu chưa có:

```sql
CREATE DATABASE IF NOT EXISTS smart_cafe_engagement_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Hibernate tạo bảng `Notifications` theo cấu hình `ddl-auto: update` hiện tại. Không cần sửa bảng Users hay tạo khóa ngoại liên database.

**Cách A: không dùng Docker, cài RabbitMQ trực tiếp trên Windows.**

1. Cài Erlang/OTP tương thích, sau đó cài RabbitMQ bằng bộ cài Windows theo [hướng dẫn chính thức](https://www.rabbitmq.com/docs/install-windows). RabbitMQ chạy dưới dạng Windows service.
2. Mở PowerShell bằng quyền Administrator tại thư mục `sbin` của bản RabbitMQ vừa cài, ví dụ `C:\Program Files\RabbitMQ Server\rabbitmq_server-<version>\sbin`.
3. Kiểm tra broker, bật giao diện quản trị, tạo tài khoản khớp cấu hình hiện tại:

```powershell
.\rabbitmq-diagnostics.bat ping
.\rabbitmq-plugins.bat enable rabbitmq_management
.\rabbitmqctl.bat add_user smartcafe smartcafe-local
.\rabbitmqctl.bat set_permissions -p / smartcafe '.*' '.*' '.*'
.\rabbitmqctl.bat set_user_tags smartcafe administrator
```

Nếu broker chưa chạy, khởi động bằng `.\rabbitmq-service.bat start` rồi kiểm tra lại. Chỉ chạy `add_user` khi tài khoản chưa tồn tại. Tài khoản ở trên dùng cho phát triển cục bộ và khớp cấu hình mặc định của cả hai service. Mở `http://localhost:15672`, đăng nhập `smartcafe` / `smartcafe-local`.

**Cách B: chạy riêng RabbitMQ bằng Docker.** Từ thư mục `smart-cafe-ai`:

```powershell
docker compose up -d rabbitmq
```

Chọn một trong hai cách trên. Sau đó, từ thư mục `smart-cafe-ai`, tạo cấu hình Engagement nếu chưa có:

```powershell
Copy-Item backend/engagement-service/.env.example backend/engagement-service/.env
```

Sửa `backend/engagement-service/.env` với thông tin MySQL và SMTP thật:

```dotenv
ENGAGEMENT_DATASOURCE_USERNAME=root
ENGAGEMENT_DATASOURCE_PASSWORD=your-mysql-password
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=your-email@gmail.com
MAIL_SMTP_AUTH=true
MAIL_STARTTLS_ENABLE=true
MAIL_SSL_ENABLE=false
```

Với Gmail, dùng App Password và bật xác minh 2 bước theo [hướng dẫn Google](https://support.google.com/mail/answer/185833?hl=en). Điền App Password không có dấu cách. Tài khoản cơ quan/trường học có thể bị quản trị viên hạn chế tính năng này. Không commit `.env`.

Các biến RabbitMQ phải giống nhau ở hai service. Giá trị mặc định khớp Docker Compose:

```dotenv
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=smartcafe
RABBITMQ_PASSWORD=smartcafe-local
RABBITMQ_VHOST=/
```

Nếu đổi tài khoản RabbitMQ, thêm các biến tương ứng vào file `.env` mà Identity đang nạp (ứng dụng in đường dẫn khi khởi động), file `.env` của Engagement và môi trường Docker Compose. Không đặt URL database Engagement vào `.env` chung của Identity. Engagement dùng tên `ENGAGEMENT_DATASOURCE_*` để tránh dùng nhầm database từ biến chung.

## 2. Chạy các service

Mở từng terminal tại thư mục `smart-cafe-ai/backend`:

```powershell
.\mvnw.cmd -pl discovery-server spring-boot:run
```

```powershell
.\mvnw.cmd -pl engagement-service spring-boot:run
```

```powershell
.\mvnw.cmd -pl identity-service spring-boot:run
```

Có thể chạy thêm API Gateway để dùng cổng 8080. Ví dụ bên dưới gọi trực tiếp Identity ở cổng 8081.

Engagement đọc `./.env` tương đối với thư mục chạy của tiến trình Java. Maven `spring-boot:run` dùng thư mục module, nên các lệnh trên nạp đúng `engagement-service/.env`. Nếu IDE chạy từ `backend/`, đặt biến môi trường `ENGAGEMENT_ENV_FILE=./engagement-service/.env`; cũng có thể đặt đường dẫn tuyệt đối. File `.env` của Engagement dùng cú pháp `KEY=value`, không bọc giá trị trong dấu nháy. Biến môi trường của tiến trình có độ ưu tiên cao hơn file.

## 3. Kiểm tra email thật

Đăng ký bằng email của bạn, thay địa chỉ ví dụ bên dưới:

```powershell
$body = @{
    full_name = 'Khach hang test'
    email = 'your-real-email@gmail.com'
    password = 'CafeTest123!'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8081/api/v1/auth/register' `
    -ContentType 'application/json' -Body $body
```

Nếu tài khoản đã tồn tại, gọi gửi lại:

```powershell
$body = @{ phone_email = 'your-real-email@gmail.com' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8081/api/v1/auth/otp/resend' `
    -ContentType 'application/json' -Body $body
```

Mở hộp thư, kiểm tra cả Spam. Lấy mã từ email và gửi vào API xác minh hiện có:

```powershell
$body = @{ phone_email = 'your-real-email@gmail.com'; otp_code = '123456' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8081/api/v1/auth/otp/verify' `
    -ContentType 'application/json' -Body $body
```

OTP có thời hạn 5 phút và tối đa 5 lần thử. Mọi yêu cầu tạo OTP có đích là email đều đi qua luồng này: đăng ký, gửi lại, quên mật khẩu và đổi email. Đăng ký có cả email và số điện thoại ưu tiên xác minh email. Chưa tích hợp SMS; chỉ có thể xem mã điện thoại trong môi trường debug khi bật `OTP_LOG_CODES=true`. Riêng khôi phục mật khẩu yêu cầu email và không báo đã gửi SMS. Xem [luồng quên mật khẩu](../identity-service/PASSWORD_RECOVERY.md). [Đổi mật khẩu khi đã đăng nhập](../identity-service/CHANGE_PASSWORD.md) dùng mật khẩu hiện tại và mật khẩu mới, không dùng OTP.

## 4. Theo dõi trạng thái và lỗi

```sql
-- Chạy trong smart_cafe_engagement_db
SELECT event_id, recipient, purpose, status, attempt_count, last_error, sent_at
FROM notifications ORDER BY id DESC LIMIT 20;

-- Chạy trong smart_cafe_identity_db
SELECT event_id, status, retry_count, last_error, published_at
FROM outbox_events WHERE event_type = 'OtpEmailRequested' ORDER BY id DESC LIMIT 20;
```

- `PENDING`: đang chuẩn bị gửi; `SENT`: SMTP đã chấp nhận email; `FAILED`: lần gửi gần nhất thất bại; `EXPIRED`: hết hạn trước lúc gửi.
- `SENT` không bảo đảm thư đã vào Inbox; kiểm tra Spam và chính sách nhà cung cấp.
- SMTP lỗi: thử tối đa 3 lần cho mỗi lần tiêu thụ, nghỉ 2 giây rồi 4 giây. Sau đó chuyển sang `engagement.otp.email.dlq`; yêu cầu OTP mới sau khi sửa cấu hình. Khởi động lại service sau khi sửa `.env`.
- RabbitMQ ngắt: yêu cầu vẫn ở outbox và thử lại sau 5 giây, đến khi gửi thành công hoặc OTP hết hạn. Publisher chạy mỗi giây. Chỉ publish dữ liệu đã commit và đợi broker xác nhận, kiểm tra cả trường hợp không có queue nhận.
- Cả queue và message đều bền vững. Queue dùng single active consumer, event ID duy nhất và trạng thái `SENT` để tránh gửi lặp khi RabbitMQ giao lại thông thường.
- Nếu tiến trình chết sau khi SMTP nhận thư nhưng trước khi ghi `SENT`, lần giao lại có thể gửi trùng. SMTP không hỗ trợ giao dịch nguyên tử với database.
- OTP rõ chỉ tồn tại tạm trong outbox pending và message để gửi mail; outbox xóa payload sau publish/hết hạn, DLQ tự xóa sau 5 phút. Bảng `Notifications` không lưu mã OTP hay nội dung email. Terminal Identity vẫn in OTP theo yêu cầu hiện tại.
- Bảng `notifications` có các cột bắt buộc `type`, `channel`, `title`, `body`, `is_read`; entity ghi đầy đủ các cột này khi nhận OTP. `body` chỉ chứa mô tả thông báo, không chứa mã OTP. Nếu thấy lỗi `Field 'type' doesn't have a default value`, hãy biên dịch và khởi động lại Engagement để dùng entity mới.
- SQL cho truy vấn outbox mỗi giây mặc định được tắt để dễ thấy dòng `[OTP CODE]` ở Identity. Có thể đặt `SHOW_SQL=true` trong môi trường Identity khi cần xem SQL.

RabbitMQ Management: `http://localhost:15672`, tài khoản mặc định `smartcafe` / `smartcafe-local` (dùng cho máy phát triển).

API trạng thái nội bộ: đặt `NOTIFICATION_INTERNAL_TOKEN` trong `.env` Engagement, rồi gọi trực tiếp cổng 8087:

```powershell
Invoke-RestMethod -Uri 'http://localhost:8087/api/v1/internal/notifications/EVENT_ID' `
    -Headers @{ 'X-Internal-Token' = 'your-internal-token' }
```

Endpoint không trả email/mã OTP, bị từ chối nếu chưa cấu hình token và không nằm trong route public của Gateway.

## 5. Kiểm tra SMTP cục bộ bằng Mailpit

Từ thư mục `smart-cafe-ai`:

```powershell
docker compose --profile mail-test up -d rabbitmq mailpit
```

Thay cấu hình SMTP trong `.env` Engagement rồi khởi động lại service:

```dotenv
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM=no-reply@smartcafe.local
MAIL_SMTP_AUTH=false
MAIL_STARTTLS_ENABLE=false
MAIL_SSL_ENABLE=false
```

Thực hiện đăng ký/gửi lại OTP và xem thư tại `http://localhost:8025`. Mailpit giữ thư trong hộp thư thử cục bộ; thư không chuyển ra Gmail. Các cổng và chế độ không xác thực mặc định được mô tả trong [tài liệu Mailpit](https://mailpit.axllent.org/docs/configuration/smtp/).

## 6. Kiểm thử tự động

Từ `smart-cafe-ai/backend`:

```powershell
.\mvnw.cmd -pl identity-service,engagement-service test
```

Test dùng H2 và mock SMTP/Rabbit publisher, không gửi thư thật: kiểm tra rollback OTP/outbox cùng nhau, OTP điện thoại, confirm/return/lỗi broker, hết hạn, JSON giữa service, nội dung MIME, lỗi SMTP lưu `FAILED`, gửi lại, chống trùng và phân quyền endpoint trạng thái.
