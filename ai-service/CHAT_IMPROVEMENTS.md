# Chat AI improvements


- `src/app/chat/rag.py`: chuẩn hóa và giới hạn lịch sử hội thoại, không tự ý loại tin nhắn user gần nhất trong lịch sử; viết lại câu hỏi tiếp nối có fallback; giới hạn context gửi tới LLM; tăng khả năng xử lý truy xuất lỗi và cấu hình top-k.
- `src/app/chat/schemas.py`: loại bỏ khoảng trắng thừa, từ chối tin nhắn rỗng và giới hạn số lượng/từng kích thước tin nhắn trong history.
- `src/app/chat/prompts.py`: hướng dẫn tư vấn tối đa 3 món, tôn trọng ngân sách, hỏi lại khi thiếu tiêu chí quan trọng và không khẳng định thao tác nghiệp vụ chưa được API xác nhận.
- `src/app/api/routes/chat.py`: ghi lỗi ở server log và không trả chi tiết lỗi nội bộ về frontend.

## Cấu hình môi trường có thể điều chỉnh

- `RAG_TOP_K=4`: số đoạn tri thức tối đa truy xuất.
- `RAG_MIN_SCORE=0.68`: ngưỡng truy xuất ban đầu; cần đánh giá bằng bộ câu hỏi thật của quán trước khi chốt.
- `LLM_TIMEOUT_SECONDS=90`: timeout của LLM (đã có trong adapter hiện tại).

## Lưu ý

- Frontend nên gửi `history` chỉ gồm các lượt trước đó; không đưa `message` hiện tại lặp lại trong `history`.
- Sau khi chỉnh sửa file trong `knowledge_base/`, gọi `POST /chat/reindex` để nạp lại chỉ mục.
- Các thay đổi này cải thiện luồng hội thoại và an toàn lỗi; chưa tự tích hợp đặt hàng, dữ liệu tài khoản hay recommendation API vào LLM.
