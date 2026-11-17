# Chat evaluation

`chat_eval_seed.jsonl` gồm 320 câu có nhãn, được tạo từ catalog và các
kịch bản nghiệp vụ trong repository. Đây là **seed set**, không được mô tả
là log production thật.

Tạo lại seed và chạy evaluator:

```powershell
python scripts/build_chat_eval_dataset.py
python scripts/evaluate_chat.py --top-k 4 --output evaluation/latest_metrics.json
```

Nhập log thật (JSONL có field `message`, `query` hoặc `user_message`):

```powershell
python scripts/build_chat_eval_dataset.py --logs private/chat-log.jsonl --output evaluation/from_logs.review.jsonl
```

Email, số điện thoại và mã đơn được ẩn danh. Các dòng nhập từ log có
`needs_review=true`; người đánh giá phải gắn intent, source và answer criteria
trước khi evaluator sử dụng. Không commit log thô hoặc PII.

Metrics hiện có: intent macro-F1, retrieval Recall@K, groundedness, task
success, latency p50/p95 và confusion pairs.

Benchmark retrieval riêng theo nhóm menu, price, policy và follow-up:

```powershell
python scripts/evaluate_retrieval.py --output evaluation/retrieval_metrics.json
python scripts/evaluate_retrieval.py --lexical-only --output evaluation/retrieval_metrics.lexical.json
```

Benchmark này báo cáo Recall@1/3/5/10/12 và MRR cho toàn bộ dataset và từng nhóm.
`retrieval_eval.jsonl` là bộ case nhỏ có history thật cho follow-up; có thể mở rộng
thêm case khi có log production đã ẩn danh.
