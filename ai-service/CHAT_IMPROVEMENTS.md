# Chatbot AI — kiến trúc và cấu hình

## Cấu hình

Xem `.env.example`. Các biến chính:

- `RAG_TOP_K=4`, `RAG_MIN_SCORE=0.68`, `RAG_LEXICAL_WEIGHT=0.30`.
- `RAG_ALLOW_MODEL_DOWNLOAD=true`; đặt `false` để fail-fast nếu model chưa có local.
- `RAG_DISABLE_EMBEDDINGS=true` để chạy lexical-only khi môi trường offline.
- `LLM_TIMEOUT_SECONDS=45`, `LLM_MAX_RETRIES=2`.
- Retry chỉ áp dụng cho timeout, transport error, HTTP 429/500/502/503/504.

Sau khi sửa file trong `knowledge_base/`, gọi `POST /chat/reindex` để nạp lại index.
Frontend chỉ gửi các lượt trước trong `history`, không lặp `message` hiện tại.

## Kiểm thử

```powershell
python -m pytest -q tests/chat src/app/chat/test_rag.py
```

## Ollama naturalizer

`CHAT_NATURALIZE_RESPONSES=true` cho phép Ollama/provider viết lại câu tư vấn
sản phẩm. Naturalizer không nhận câu hỏi thô của khách, chỉ nhận bản
grounded. Rewrite bị loại nếu thay tên món, con số, giá, field mô tả,
nhiệt độ, caffeine hoặc làm mất cảnh báo chưa xác nhận.

Nhóm giá, tồn kho, order status và policy vẫn ưu tiên câu deterministic.
Nếu provider lỗi hoặc rewrite không qua validator, chatbot tự dùng bản grounded.
