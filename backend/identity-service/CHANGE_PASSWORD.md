# Đổi mật khẩu khi đã đăng nhập

Người dùng nhập mật khẩu hiện tại và mật khẩu mới, rồi bấm Đổi mật khẩu.
Ứng dụng gọi một API; không gửi hoặc nhập OTP trong luồng này.

```http
PUT http://localhost:8081/api/auth/change-password
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewPassword456!"
}
```

Cũng chấp nhận tên trường `currentPassword`, `newPassword`.
Tiền tố `/auth` và `/api/v1/auth` được hỗ trợ khi gọi trực tiếp Identity.
Qua Gateway dùng `http://localhost:8080/api/v1/auth/change-password`.

Mật khẩu mới phải:

- Có ít nhất 8 ký tự, gồm chữ và số.
- Không dài quá 72 byte UTF-8 theo giới hạn BCrypt.
- Khác mật khẩu hiện tại.

Tài khoản phải ở trạng thái `Active` và có mật khẩu hiện tại. Tài khoản Google
chưa thiết lập mật khẩu có thể dùng luồng quên mật khẩu để thiết lập qua email;
API đổi mật khẩu không bỏ qua kiểm tra mật khẩu hiện tại.

HTTP 200:

```json
{
  "success": true,
  "data": "Đổi mật khẩu thành công",
  "traceId": "..."
}
```

Giao diện có thể hiển thị `data` khi `success` là `true`.
Sau khi đổi, mật khẩu mới được hash; toàn bộ refresh token và OTP quên mật khẩu
còn hiệu lực bị thu hồi trong cùng transaction. Access token đã cấp vẫn hết hạn
theo cấu hình JWT. Khi refresh token bị từ chối, ứng dụng đưa người dùng về đăng nhập.

| HTTP | Mã lỗi | Ý nghĩa |
|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu, sai, hết hạn access token hoặc tài khoản không còn được xác thực |
| 400 | `VALIDATION_ERROR` | Thiếu trường, JSON sai, mật khẩu mới yếu/quá dài/trùng mật khẩu hiện tại |
| 400 | `CURRENT_PASSWORD_INVALID` | Mật khẩu hiện tại không đúng |
| 400 | `CURRENT_PASSWORD_NOT_SET` | Tài khoản chưa có mật khẩu hiện tại |
| 403 | `ACCOUNT_DISABLED` | Tài khoản chuyển sang trạng thái không hoạt động trước lúc cập nhật |

Refresh token không được dùng trong header Authorization. Endpoint cũ
`POST /auth/change-password/otp` đã được bỏ và trả HTTP 404; giao diện bỏ bước gọi
endpoint này và màn hình xác minh OTP đổi mật khẩu.

Luồng quên mật khẩu vẫn dùng OTP như mô tả tại [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md).
