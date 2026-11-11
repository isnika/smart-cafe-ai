# Thay đổi đăng ký, đổi liên hệ và avatar

## 1. Đăng ký email/mật khẩu

`POST /api/v1/auth/register` bắt buộc cả `email` và `phone`.
Quy định này không áp dụng cho đăng nhập/tạo tài khoản Google.

```json
{
  "full_name": "Nguyễn Văn An",
  "email": "an@example.com",
  "phone": "0901234567",
  "password": "Password123!"
}
```

- Dùng lại quy định `full_name` từ API cập nhật hồ sơ; không có hai bộ quy tắc khác nhau.
- Email được trim, chuyển chữ thường, kiểm tra định dạng và tối đa 100 ký tự.
- Số di động Việt Nam: 10 chữ số, đầu 03/05/07/08/09. Chấp nhận `+84`, lưu về dạng bắt đầu bằng `0`.
- Kiểm tra trùng email không phân biệt hoa/thường và trùng số ở cả dạng `0`/`+84`.
- Dùng lại kiểm tra mật khẩu hiện có: tối thiểu 8 ký tự, có chữ và số, tối đa 72 byte UTF-8.
- OTP đăng ký và OTP gửi lại chỉ được gửi tới email. Xác minh bằng email không đánh dấu số điện thoại đã xác minh.
- `201`: thành công; `400`: dữ liệu sai/thiếu; `409`: thông tin đã được sử dụng, kể cả tranh chấp tại database.

## 2. Đổi liên hệ — mọi OTP đều gửi email

Đăng nhập trước, gửi `Authorization: Bearer <access_token>`.

### Đổi email

1. `POST /api/v1/users/me/contact/otp`, body `{"email":"new@example.com"}`.
2. Nhận mã qua **email mới**.
3. `PUT /api/v1/users/me/contact`, body `{"email":"new@example.com","otp_code":"012345"}`.

### Đổi số điện thoại

1. `POST /api/v1/users/me/contact/otp`, body `{"phone":"0911111111"}`.
2. Nhận mã qua **email hiện tại đã xác minh**, không gửi SMS.
3. `PUT /api/v1/users/me/contact`, body `{"phone":"0911111111","otp_code":"012345"}`.

OTP gắn với ID tài khoản, số mới và mục đích `Change_Phone`; email chỉ là nơi nhận mã.
OTP email xác nhận quyền thực hiện thao tác, không chứng minh quyền sở hữu số điện thoại.
Vì vậy số mới có `phone_verified_at = null`.

Giữ tương thích payload cũ `email + new_email` hoặc `phone + new_phone`:
khi dùng dạng này, giá trị hiện tại phải khớp tài khoản.
Dạng một trường ở trên khớp tài liệu API; không cần lặp lại thông tin cũ đã có trong tài khoản.
Tài khoản Google hoặc dữ liệu cũ thiếu số điện thoại có thể cung cấp số mới bằng dạng một trường,
sau khi email hiện tại đã xác minh. Đăng ký email/mật khẩu mới luôn có cả hai trường.

- Mỗi lần chỉ thay đổi email hoặc số điện thoại; từ chối chuỗi rỗng, sai định dạng, JSON sai kiểu và giá trị không đổi.
- OTP gồm 6 chữ số, hiệu lực 5 phút, chỉ dùng một lần, đúng người dùng/đích/mục đích.
- Gửi lại cách nhau ít nhất 60 giây, tối đa 5 yêu cầu/giờ cho mỗi tài khoản và loại thay đổi; đổi đích không né được giới hạn.
- Sai 5 lần: khóa 60 giây, trả `429` và `Retry-After`; bộ đếm và khóa được lưu ngay cả khi API báo lỗi.
- Gửi lại vô hiệu mã cũ của cùng loại. Đổi liên hệ thành công vô hiệu các OTP đổi liên hệ đang chờ để không dùng lại mã gửi tới email cũ.
- Dùng lại khóa ghi tài khoản trong repository để xử lý yêu cầu đồng thời.
- Các lỗi validation/OTP thông thường: `400`; trùng: `409`; giới hạn OTP: `429`.

Thiết lập: `CONTACT_OTP_RESEND_COOLDOWN_SECONDS` (60), `CONTACT_OTP_MAX_REQUESTS_PER_HOUR` (5).
Tái sử dụng `OtpEmailOutboxService` → RabbitMQ → engagement-service → `EmailService`.
Engagement bổ sung nhận mục đích `Change_Phone`, không thêm nhà cung cấp gửi mail/SMS.

## 3. Avatar

`POST /api/v1/users/me/avatar`, Body form-data: key `file`, kiểu File.

- Chỉ JPEG/PNG; kiểm tra nội dung bằng bộ giải mã ảnh, không chỉ tin tên file hoặc MIME client khai báo.
- File tối đa 5 MB, tổng request tối đa 10 MB; ảnh tối đa 4096 × 4096 pixel.
- `400`: thiếu/rỗng/sai/hỏng ảnh hoặc MIME không khớp; `413`: quá dung lượng; `502`: Cloudinary lỗi hoặc trả metadata không hợp lệ.
- Upload dạng `image`, public ID riêng theo tài khoản và UUID; kiểm tra URL HTTPS, độ dài 255 và public ID trước khi lưu.
- Response: `{"success":true,"data":{"avatar":"https://..."},"traceId":"..."}`.
- Thay ảnh thành công: dọn ảnh cũ do hệ thống quản lý; database rollback: dọn ảnh mới vừa upload.
- Yêu cầu dọn ảnh cũ được ghi cùng giao dịch cập nhật hồ sơ, chỉ được xử lý khi giao dịch đã commit.
- Dùng lại `Outbox_Events` để lưu yêu cầu xóa và thử lại khi Cloudinary tạm lỗi. Không cần bảng mới.
- Chỉ xóa ảnh trong thư mục do tài khoản đó sở hữu. URL bên ngoài hoặc ảnh cũ chưa xác định được chủ sở hữu không bị tự động xóa.

## 4. Những file đã sửa/thêm trong đợt này

| File | Thay đổi |
|---|---|
| `service/AuthService.java` | Bắt buộc hai liên hệ khi đăng ký thường; chuẩn hóa, kiểm tra trùng/mật khẩu; OTP đăng ký/gửi lại chỉ qua email |
| `service/UserService.java` | Dùng chung validation tên; kiểm tra đổi liên hệ, hỗ trợ payload tài liệu/cũ; khóa tài khoản; đổi số xác nhận qua email; quản lý giao dịch avatar |
| `service/OtpService.java` | Tách đích được xác nhận khỏi email nhận mã; giới hạn yêu cầu và khóa OTP đổi liên hệ; vô hiệu mã cũ |
| `service/CloudinaryService.java` | Kiểm tra nội dung/kích thước ảnh, upload có metadata, xác định quyền sở hữu ảnh và yêu cầu dọn ảnh |
| `service/AvatarCleanupService.java` (mới) | Dùng lại outbox để xóa ảnh và thử lại khi thất bại |
| `validation/ProfileValidation.java` (mới) | Quy định tên/email/số dùng chung; phần tên được chuyển từ UserService để tái sử dụng |
| `dto/StrictStringDeserializer.java` (mới) | Tái sử dụng kiểm tra chuỗi trước đây nằm trong DTO tên cho các trường đăng ký/liên hệ |
| `dto/auth/RegisterRequest.java`, `dto/user/UpdateContactRequest.java`, `dto/user/UpdateProfileRequest.java` | Kiểm tra JSON đúng kiểu chuỗi và làm rõ ý nghĩa payload |
| `exception/ApiException.java` (mới), `exception/GlobalExceptionHandler.java` | Phản hồi lỗi HTTP cụ thể, Retry-After, lỗi file, xung đột DB, lỗi kiểu dữ liệu |
| `controller/AuthController.java`, `controller/UserController.java` | Trả đúng mã xung đột và response avatar |
| `repository/UserRepository.java`, `repository/OtpLogRepository.java` | Truy vấn trùng đã chuẩn hóa và OTP mới nhất của tài khoản |
| `src/main/resources/application.yaml` | Giới hạn OTP đổi liên hệ |
| engagement: `dto/OtpEmailEvent.java`, `service/EmailService.java` | Tái sử dụng luồng email cho OTP đổi số điện thoại |
| Các test đăng ký/liên hệ/avatar và `OtpEmailFlowTest` | Kiểm tra API, dữ liệu thực trong H2, chống dùng sai OTP, đồng thời, commit/rollback và retry xóa ảnh |

Khởi động lại cả identity-service và engagement-service sau khi cập nhật.
Test tự động dùng H2, Cloudinary/SMTP giả lập; không gửi thư hoặc tải/xóa ảnh thật.

`PUT /users/me` cũng kiểm tra URL avatar HTTPS/tối đa 255 ký tự khi được cung cấp,
để không thể lưu URL rác qua API cập nhật hồ sơ rồi bỏ qua quy định của avatar.

## 5. Kết quả xác minh

- identity-service: 222 test, 0 lỗi, 0 thất bại.
- engagement-service: 7 test, 0 lỗi, 0 thất bại.
- Tổng: 229 test thành công; Maven reactor báo `BUILD SUCCESS`.
- Có kiểm tra OTP sai người dùng/đích/mục đích, hết hạn, lần thử thứ 5 được commit,
  giới hạn theo tài khoản khi đổi đích và hai request đồng thời cùng tranh chấp một email.
- Avatar có kiểm tra file giả, quá dung lượng/kích thước, provider lỗi, DB rollback,
  dọn ảnh sau commit, quyền sở hữu ảnh và thử lại yêu cầu xóa thất bại.
- Maven chạy với `-Dmaven.compiler.fork=true` vì compiler trong cùng JVM bị Windows từ chối truy cập một thư viện cache.
