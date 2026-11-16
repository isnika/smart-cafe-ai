# Quên mật khẩu bằng email

Luồng này dùng lại `OtpService` và hệ thống gửi OTP hiện có:
Identity → outbox → RabbitMQ → engagement-service → SMTP.
Không cần tạo thêm dịch vụ gửi email. Cấu hình và cách chạy các dịch vụ nằm trong
[hướng dẫn email OTP](../engagement-service/README.md).

## 1. Yêu cầu OTP

```http
POST http://localhost:8081/api/v1/auth/forgot-password
Content-Type: application/json
```

```json
{
  "phone_email": "email-da-dang-ky@example.com"
}
```

Không cần Authorization. Tên trường `phone_email` được giữ để tương thích;
khôi phục mật khẩu hiện nhận email, chưa hỗ trợ SMS.
Email được trim và chuyển về chữ thường khi tìm tài khoản.
Chỉ tài khoản `Active` nhận OTP.

HTTP 200 nghĩa là đã tiếp nhận yêu cầu, không phải bằng chứng email đã đến hộp thư.
Response giống nhau với email không tồn tại, tài khoản không hoạt động hoặc đang
bị giới hạn gửi lại để tránh tiết lộ tài khoản. Kiểm tra Inbox và Spam.
Không trả OTP trong response.

- OTP có 6 chữ số, hết hạn sau 5 phút, tối đa 5 lần nhập sai cho mỗi mã.
- Lần nhập sai thứ 5 bắt đầu khóa 60 giây, tính từ thời điểm nhập sai. Trong lúc
  khóa, cả reset và yêu cầu gửi mã mới trả HTTP 429, `OTP_TOO_MANY_ATTEMPTS`,
  kèm header `Retry-After` là số giây còn lại. Các lần gọi khi đang khóa không
  kéo dài thời gian khóa. Hết 60 giây phải yêu cầu mã mới; mã cũ không dùng lại được.
- Chờ ít nhất 60 giây giữa hai lần yêu cầu; tối đa 5 mã/giờ/tài khoản.
- Mã mới thay thế mã cũ. Chỉ mã mới nhất được chấp nhận và chỉ dùng một lần.
- Email thiếu/sai định dạng hoặc số điện thoại: HTTP 400, `VALIDATION_ERROR`.

## 2. Đặt lại mật khẩu

```http
POST http://localhost:8081/api/v1/auth/reset-password
Content-Type: application/json
```

```json
{
  "phone_email": "email-da-dang-ky@example.com",
  "otp_code": "ma-6-so-trong-email",
  "new_password": "NewPassword123!"
}
```

Mật khẩu cần ít nhất 8 ký tự, có chữ và số, tối đa 72 byte UTF-8 (giới hạn BCrypt).
Dữ liệu sai bị từ chối trước khi tiêu thụ OTP. OTP phải đúng tài khoản và mục đích
`Reset_Password`. OTP hết hạn, sai (trước lần thứ 5), đã dùng hoặc đã hết lượt
sau thời gian khóa: HTTP 400, `OTP_INVALID`. Lần sai thứ 5 và các yêu cầu trong
thời gian khóa trả HTTP 429 như mô tả ở trên.

Thành công trả HTTP 200 và `success: true`. Mật khẩu mới được hash; toàn bộ refresh
token và OTP khôi phục còn lại của tài khoản bị thu hồi trong cùng transaction.
Access token đã cấp vẫn hết hạn theo thời gian cấu hình JWT.

Cả hai API cũng hỗ trợ tiền tố `/auth` và `/api/auth` khi gọi trực tiếp Identity.
Qua Gateway dùng `http://localhost:8080/api/v1/auth/...`.

## 3. Cấu hình và kiểm tra

Identity mặc định bật publisher email. RabbitMQ và engagement-service phải chạy,
SMTP của engagement-service phải có thông tin hợp lệ.
Nếu sửa code hoặc cấu hình, khởi động lại Identity; khởi động lại Engagement khi
đổi cấu hình SMTP.

Biến môi trường tùy chọn của Identity:

```dotenv
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS=60
PASSWORD_RESET_MAX_REQUESTS_PER_HOUR=5
OTP_LOG_CODES=false
```

Thời gian khóa sau 5 lần sai dùng cùng cấu hình `PASSWORD_RESET_RESEND_COOLDOWN_SECONDS`.
Cột nullable `OTP_Logs.locked_until` lưu thời điểm hết khóa để không mất trạng thái
khi khởi động lại ứng dụng. Cấu hình `ddl-auto: update` hiện tại tự bổ sung cột khi
khởi động lại Identity. Nếu quản lý schema thủ công, thêm cột `locked_until DATETIME(6) NULL`.

Mặc định không ghi mã OTP ra log. Chỉ bật `OTP_LOG_CODES=true` khi cần debug cục bộ,
không bật trên môi trường triển khai thật.

Kiểm thử: yêu cầu OTP → lấy mã từ email → reset → đăng nhập bằng mật khẩu mới;
mật khẩu cũ và refresh token cũ phải bị từ chối. Thử thêm mã hết hạn, mã dùng lại,
5 lần nhập sai, gửi lại trong 60 giây và hai request reset đồng thời.
