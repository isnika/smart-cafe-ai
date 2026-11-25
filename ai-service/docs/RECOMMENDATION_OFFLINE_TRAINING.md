# Offline recommendation training

## Phạm vi

Recommendation vẫn giữ `RecommendationService` hiện tại làm baseline. Pipeline
mới chỉ dùng purchase events có thật trong dataset/snapshot; không tự tạo
impression, click, add-to-cart hoặc favorite. API `POST /api/recommendation` vẫn
giữ nguyên request/response contract.

## Dữ liệu hiện có

Dataset demo trong `src/app/recommendation/data_mock` có catalog, orders,
order_items, ratings và aggregate `user_item_summary`. Purchase event được tạo
từ `orders.csv` join `order_items.csv`. Dataset mock hiện không có cột status,
vì vậy pipeline ghi rõ `no_status_column_available` và không thể lọc
cancellation/payment failure từ nguồn này. Live snapshot hiện chỉ expose
aggregate interaction gồm `user_id`, `product_id`, `quantity`, `n_orders`,
`last_purchase` và `rating`; muốn train temporal đầy đủ trong production cần BE
cung cấp lịch sử event/order đủ timestamp.

## Thuật toán được so sánh

- `popularity`: trending theo cửa sổ gần nhất, fallback về toàn bộ lịch sử.
- `content_tfidf`: TF-IDF từ name/category/description/temperature/caffeine/tags
  và cosine similarity.
- `item_item_cosine`: item-item collaborative filtering hiện hành.
- `current_hybrid`: implementation serving hiện tại, dùng để giữ baseline.
- `als`: implicit ALS tự triển khai, dùng preference/confidence từ quantity và
  order count, không biến purchase thành rating 1–5.
- `bpr`: Bayesian Personalized Ranking matrix factorization với negative
  sampling từ item chưa quan sát; item chưa quan sát không được coi là dislike.
- `hybrid_*`: kết hợp latent model, content và popularity. Các trọng số được
  thử trên validation, không mặc định một bộ trọng số cố định.

Lý thuyết implicit feedback tham khảo:

- Hu, Koren & Volinsky (2008), *Collaborative Filtering for Implicit Feedback
  Datasets*, DOI: [10.1109/ICDM.2008.22](https://doi.org/10.1109/ICDM.2008.22).
- Rendle et al. (2009), *BPR: Bayesian Personalized Ranking from Implicit
  Feedback*, UAI 2009.

## Chia tập và chọn model

Pipeline dùng temporal split, mặc định:

```text
train      = trước validation_start
validation = validation_start .. test_start
test       = từ test_start tới latest_event
```

Model được chọn chỉ bằng `NDCG@5` trên validation. `Recall@5` và coverage là
metrics phụ. Test chỉ dùng để báo cáo cuối, không dùng để chọn model. Relevance
là product được mua trong tương lai nhưng chưa có trong training history của
user.

Metrics gồm `Precision@K`, `Recall@K`, `NDCG@K`, `coverage@K` và
`diversity@K`. Pipeline không suy ra CTR, conversion hay doanh thu từ offline
metrics.

## Cách chạy

Từ thư mục `ai-service`:

```powershell
python scripts/train_recommendation.py
```

Tham số chính:

```powershell
python scripts/train_recommendation.py `
  --products src/app/recommendation/data_mock/products.csv `
  --orders src/app/recommendation/data_mock/orders.csv `
  --order-items src/app/recommendation/data_mock/order_items.csv `
  --ratings src/app/recommendation/data_mock/ratings.csv `
  --artifact-out artifacts/recommendation/selected.joblib `
  --metrics-out evaluation/recommendation_offline_metrics.json `
  --top-k 5
```

Kết quả gồm:

- `artifacts/recommendation/selected.joblib`: artifact được ghi atomic.
- `artifacts/recommendation/selected.metadata.json`: metadata dễ đọc.
- `evaluation/recommendation_offline_metrics.json`: split, counts, metrics
  validation/test, model được chọn và model không chạy được.

Artifact chứa algorithm/model version, data fingerprint, cutoff, feature
schema, mappings/factors khi model latent, score map theo user, fallback
popularity score và TF-IDF vectorizer đã fit. Không lưu token, password hoặc
PII ngoài user ID cần cho inference.

## API serving và fallback

Đường dẫn artifact cấu hình bằng:

```text
RECOMMENDATION_ARTIFACT_PATH=artifacts/recommendation/selected.joblib
```

Khi artifact hợp lệ, personalized recommendation đọc score đã train offline;
API không fit ALS, BPR, hybrid weights hoặc TF-IDF vocabulary trong request.
Catalog active/available và branch hiện hành vẫn được lọc như baseline.

Nếu artifact thiếu, sai schema, không tương thích feature hoặc chưa có user,
service giữ baseline hiện tại và ghi `fallback_reason` phù hợp. `similar`,
`trending` và `reorder` vẫn giữ hành vi baseline; `similar` dùng vectorizer đã
lưu nếu artifact có content branch. Không tự động tải model/dependency từ
Internet lúc API chạy.

## Kết quả và giới hạn

Số liệu thật của từng lần chạy phải đọc từ
`evaluation/recommendation_offline_metrics.json`; tài liệu này không hard-code
metrics để tránh nhầm kết quả demo với production. Dữ liệu mock thiếu status và
exposure logs, live snapshot hiện là aggregate, chưa có online A/B test. Vì vậy
chưa thể kết luận CTR/conversion hoặc hiệu quả production. Khi BE có historical
events và exposure attribution, cần chạy lại pipeline với cùng temporal protocol
và bổ sung online evaluation.

## Kết quả lần chạy hiện tại

Lệnh mặc định đã chạy trên dataset mock với 102 products, 67,285 purchase
events, 492 users và 16,069 user-item interactions. Temporal split dùng 55,378
train events, 5,717 validation events và 6,190 test events; có 341 user đủ điều
kiện ở validation và 362 user ở test. Dataset không có order status nên không
lọc được cancellation/payment failure.

Model được chọn bằng validation NDCG@5 là
`hybrid_bpr_l0.70_c0.20_p0.10`:

| Model | Validation P@5 | Validation R@5 | Validation NDCG@5 | Test NDCG@5 |
|---|---:|---:|---:|---:|
| popularity | 0.059238 | 0.115708 | 0.095288 | 0.110231 |
| content_tfidf | 0.075073 | 0.166196 | 0.125765 | 0.131245 |
| item_item_cosine | 0.089736 | 0.194100 | 0.157896 | 0.166877 |
| current_hybrid | 0.090909 | 0.202391 | 0.160363 | 0.173575 |
| als | 0.072727 | 0.157835 | 0.118004 | 0.115231 |
| bpr | 0.079179 | 0.169433 | 0.147242 | 0.149421 |
| hybrid_bpr_l0.70_c0.20_p0.10 | 0.088563 | 0.195920 | **0.162962** | 0.165170 |

Các biến thể hybrid còn lại và metrics coverage/diversity đầy đủ nằm trong
`evaluation/recommendation_offline_metrics.json`. Test không được dùng để chọn
model; việc current hybrid có test NDCG cao hơn model được chọn là lý do cần
giữ baseline và tiếp tục đánh giá trên rolling split/online traffic thay vì
khẳng định model mới luôn tốt hơn.
