# Smart Café AI — Frontend Test Chatbot

Công cụ nội bộ để chat trực tiếp với FastAPI, kiểm tra payload/history, nguồn RAG,
latency, HTTP status và lỗi provider. Ứng dụng không chứa mock response ở runtime.

## API contract đã đối chiếu

- Chat: `POST /chat`
- Health check: `GET /health`
- Request: `{ "message": string, "history": [{ "role": "user" | "assistant", "content": string }] }`
- Response: `{ "answer": string, "sources": SourceChunk[] }`

Tin nhắn hiện tại chỉ nằm trong `message`. Frontend chỉ đưa các lượt user/assistant
đã thành công vào `history`; HTTP error không được thêm thành assistant message.

## Chạy local

1. Chạy AI service:

   ```powershell
   cd ..\ai-service
   python -m uvicorn src.app.main:app --reload --port 8000
   ```

2. Cài và chạy frontend:

   ```powershell
   cd ..\frontend-test-chatbot
   Copy-Item .env.example .env.local
   npm.cmd install
   npm.cmd run dev
   ```

3. Mở `http://127.0.0.1:5173`.

## Cấu hình

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_CHAT_ENDPOINT=/chat
VITE_REQUEST_TIMEOUT_MS=45000
```

Base URL, endpoint, timeout và Debug Mode cũng có thể thay đổi trực tiếp trong
Debug Console; cấu hình được lưu vào `localStorage`.

## Kiểm tra chất lượng

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Hành vi test case

- Nhấn test case để điền câu hỏi, không tự động đánh dấu PASS.
- Test Context có hai bước. Sau khi bước 1 trả lời thành công, frontend mới điền
  bước 2; khi gửi bước 2, request chứa đúng history của bước 1.
- PASS/FAIL là đánh giá thủ công của AI Engineer.

## Lưu ý

- Browser không thể phân biệt hoàn toàn network failure với CORS block; thông báo
  lỗi hướng dẫn kiểm tra cả Backend và CORS.
- Backend hiện không trả token usage trong `ChatResponse`, nên UI chỉ hiện token
  khi provider/Backend thực sự bổ sung trường usage vào JSON.
- Hội thoại được lưu trên trình duyệt hiện tại, không đồng bộ với bảng Chat_Sessions.
