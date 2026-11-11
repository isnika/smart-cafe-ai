# Chatbot AI — kiến trúc và cấu hình

## Luồng runtime

`POST /chat` → `ChatService` → làm sạch/sliding-window history → nối ngữ cảnh
follow-up → hybrid retrieval (dense cosine + lexical/fuzzy) → lọc chunk gần trùng
→ LLM OpenAI-compatible → `ChatResponse` gồm `answer` và `sources`.

Source hiện tại không có Gemini SDK riêng. Provider sinh câu trả lời dùng endpoint
OpenAI-compatible, nên Gemini chỉ được dùng nếu hạ tầng hiện hữu cung cấp endpoint
tương thích và cấu hình `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` tương ứng.

Khi embedding không khả dụng, retriever tự chuyển sang lexical search. Khi provider
LLM timeout hoặc lỗi sau retry, pipeline trả lời trích xuất từ các chunk đã retrieval
thay vì làm hỏng contract API.

## Ranh giới dữ liệu Backend

Đối chiếu `db_smart_cafe.txt`:

- Menu: `Products` → `Product_Variants.price`; giá có thể khác theo biến thể.
- Khả dụng: `Branch_Product_Availability`; không suy ra tồn món chỉ từ knowledge base.
- Đơn hàng: `Orders.status` và `payment_status`; chatbot không tự xác nhận/hủy đơn.
- Hội thoại: `Chat_Sessions` → `Chat_Messages`; Backend chịu trách nhiệm tách
  `user_id`/`guest_key`, AI service chỉ xử lý `history` được gửi trong request.
- Tri thức DB: chỉ dùng bản ghi `Knowledge_Base` đúng `audience`, `language`, `status`.

Module hiện vẫn đọc knowledge base từ file; chưa tự kết nối các bảng trên và không
thay đổi database schema/API contract trong đợt tối ưu này.

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

Các test không gọi provider/model thật; chúng kiểm tra follow-up, typo/vùng miền,
out-of-scope, history dài, session isolation, lexical fallback, retry và provider timeout.

## Production hardening v1.2

- `GET /health` là liveness; `GET /ready` chỉ trả 200 khi knowledge index đã nạp.
- Startup preload index/embedding theo `PRELOAD_CHAT` và `RAG_WARM_EMBEDDING_MODEL`.
- `POST /chat/reindex` bắt buộc `X-Reindex-Key` khớp `CHAT_REINDEX_API_KEY`.
- `/chat` có sliding-window rate limit theo IP. Production nhiều replica nên đặt
  thêm distributed rate limit ở API gateway/Redis.
- `CHAT_SOURCE_MODE=metadata` giữ citation nhưng xóa raw chunk và similarity score;
  dùng `off` để không trả source hoặc `full` chỉ cho tester nội bộ.
- `Authorization` chỉ được forward tới Order Service; không được đưa
  vào prompt/log. `X-Branch-Id` chọn chi nhánh cho availability thời gian thực.
- Tên/mô tả/giá/menu/tồn món lấy từ Backend khi `DATA_API_BASE_URL`
  được cấu hình; chính sách ship, hoàn hủy, Wi-Fi và giờ mở cửa
  tiếp tục lấy từ knowledge base đã duyệt.
- Contract dữ liệu nghiệp vụ: `docs/OPERATIONAL_DATA_API.md`.

Evaluation offline:

```powershell
python scripts/build_chat_eval_dataset.py
python scripts/evaluate_chat.py --top-k 4 --output evaluation/latest_metrics.json
```

Seed set có 320 câu. Log thật phải được import, ẩn danh và human-label
theo hướng dẫn trong `evaluation/README.md`; không coi seed set là production benchmark.
