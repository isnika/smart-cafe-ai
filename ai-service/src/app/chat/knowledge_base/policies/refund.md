# KNOWLEDGE BASE: ORDER CANCELLATION, REFUND AND EXCHANGE

## 1. Mục đích

Tài liệu này dùng để kiểm thử các câu hỏi về hủy đơn, đổi món và hoàn tiền. Đây là chính sách mẫu; không được xem là chính sách chính thức của quán khi chưa được xác nhận.

## 2. Hủy đơn hàng

* Khả năng hủy đơn phụ thuộc trạng thái xử lý đơn hàng và quy định của quán.
* Nếu đơn chưa được xác nhận hoặc chưa pha chế, nhân viên có thể kiểm tra khả năng hủy.
* Nếu đơn đã pha chế hoặc đã giao, việc hủy có thể không còn khả thi.
* Chatbot phải kiểm tra trạng thái đơn từ API trước khi trả lời rằng đơn có thể hủy.
* Không tuyên bố đã hủy đơn nếu API chưa trả về kết quả thành công.

## 3. Đổi món

* Khách cần cung cấp mã đơn và món muốn đổi.
* Nhân viên cần xác minh đơn hàng và nguyên nhân yêu cầu đổi.
* Khả năng đổi món phụ thuộc tình trạng đơn và quy định thực tế.
* Không tự hứa đổi miễn phí hoặc giao món thay thế khi chưa được xác nhận.

## 4. Hoàn tiền

* Yêu cầu hoàn tiền cần được kiểm tra theo giao dịch và trạng thái đơn hàng.
* Những trường hợp như thanh toán trùng, giao dịch thành công nhưng đơn không được tạo, hoặc đơn bị hủy sau thanh toán cần được nhân viên đối chiếu.
* Thời gian hoàn tiền phụ thuộc phương thức thanh toán và quy trình của đơn vị xử lý thanh toán.
* Không cam kết số ngày hoàn tiền nếu chưa có chính sách chính thức.
* Chatbot chỉ được thông báo hoàn tiền thành công khi hệ thống thanh toán xác nhận.

## 5. Thông tin cần thu thập khi hỗ trợ

* Mã đơn hàng.
* Thời điểm đặt hàng gần đúng.
* Vấn đề khách gặp phải.
* Phương thức thanh toán, nếu liên quan.
* Mã giao dịch hoặc biên nhận, nếu cần đối chiếu.

Không yêu cầu mật khẩu, mã OTP hoặc toàn bộ thông tin thẻ thanh toán.

## 6. Câu hỏi thường gặp

Q: Tôi muốn hủy đơn hàng.
A: Mình có thể hướng dẫn bạn kiểm tra yêu cầu hủy. Bạn vui lòng cung cấp mã đơn hàng để hệ thống xác minh trạng thái đơn.

Q: Tôi đã thanh toán nhưng muốn hủy đơn.
A: Yêu cầu cần được kiểm tra theo trạng thái đơn và giao dịch thanh toán. Mình không thể xác nhận hoàn tiền trước khi hệ thống hoặc nhân viên kiểm tra.

Q: Tôi bị trừ tiền hai lần.
A: Bạn vui lòng giữ lại biên nhận giao dịch và cung cấp mã đơn để nhân viên đối chiếu. Không nên chia sẻ OTP hoặc mật khẩu.

Q: Bao lâu thì tôi nhận được tiền hoàn?
A: Thời gian phụ thuộc phương thức thanh toán và quy trình xử lý. Cần kiểm tra chính sách chính thức hoặc kết quả từ đơn vị thanh toán.

Q: Tôi nhận sai món.
A: Bạn vui lòng cung cấp mã đơn và mô tả món nhận được. Nhân viên sẽ kiểm tra và hướng dẫn phương án xử lý theo chính sách của quán.

Q: Chatbot có thể hoàn tiền trực tiếp không?
A: Chỉ khi hệ thống có API hoàn tiền được phân quyền và trả về kết quả xác nhận. Nếu chưa tích hợp, chatbot chỉ có thể hướng dẫn gửi yêu cầu hỗ trợ.

## 7. Nguyên tắc xử lý

* Không tự ý hủy đơn hoặc hoàn tiền.
* Không tự tạo giao dịch hoàn tiền giả.
* Không cam kết kết quả trước khi xác minh.
* Chuyển yêu cầu cần xử lý thủ công cho nhân viên.
* Bảo vệ thông tin cá nhân và dữ liệu thanh toán của khách.
