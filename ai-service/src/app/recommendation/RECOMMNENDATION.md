# Recommendation System


## 1. Luồng tổng quát

    Client
      │
      │ POST /api/recommendation
      ▼
    Recommendation Route
      ├─ Xác định mode: personalized / similar / trending / reorder
      ├─ Kiểm tra Authorization nếu cần recommendation cá nhân hóa
      ├─ Đọc X-Branch-Id nếu có
      ▼
    Recommendation Service Cache
      ├─ Lấy model đã fit theo branch_id còn trong TTL
      └─ Nếu cache hết hạn: tải snapshot mới và fit lại model
      ▼
    Repository / Data Adapter
      ├─ live: gọi Backend Operational API
      └─ demo: đọc data_mock khi bật rõ RECOMMENDATION_SOURCE_MODE=demo
      ▼
    Recommendation Service
      ├─ Lọc sản phẩm active/available
      ├─ Tạo TF-IDF content features
      ├─ Tạo user-item matrix và item-item similarity
      ├─ Tính recency, quantity, order count và rating weight
      ├─ Xếp hạng theo strategy
      └─ Trả score, reason_code, reason và fallback_reason
      ▼
    JSON Response

Model chỉ được fit khi xây snapshot. Request bình thường không đọc lại toàn bộ
CSV/database và không fit lại TF-IDF hoặc collaborative matrix.

## 2. API chính

### POST /api/recommendation

Đây là endpoint chính để lấy recommendation.

Header tùy chọn:

    Authorization: Bearer <access-token>
    X-Branch-Id: 2

Request:

    {
      "user_id": "user-uuid",
      "product_id": null,
      "mode": "personalized",
      "discovery": false,
      "top_k": 5
    }

Các field:

| Field | Bắt buộc | Ý nghĩa |
|---|---:|---|
| user_id | Không | ID user hiện tại. Live mode phải khớp user trong access token. |
| product_id | Tùy mode | Sản phẩm đang xem, bắt buộc với similar. |
| mode | Không | personalized, similar, trending hoặc reorder. |
| discovery | Không | Khi true, personalized loại các món user đã mua. Mặc định false. |
| top_k | Không | Số lượng kết quả, từ 1 đến 50. Mặc định 5. |

Response:

    {
      "user_id": "user-uuid",
      "product_id": null,
      "branch_id": 2,
      "strategy": "personalized",
      "fallback_reason": null,
      "discovery": false,
      "model_version": "hybrid-v2",
      "recommendations": [
        {
          "product_id": 3,
          "name": "Matcha latte",
          "category": "Coffee",
          "price_vnd": 55000,
          "image": "",
          "score": 0.8123,
          "reason_code": "history_and_similar_users",
          "reason": "Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự.",
          "strategy": "personalized",
          "recommendation_type": "Hybrid-Personalized"
        }
      ]
    }

score là điểm ranking đã chuẩn hóa trong response, không phải xác suất mua.

## 3. Các strategy

### personalized

Dùng khi có user và lịch sử mua:

    Purchase history
      ├─ quantity có giới hạn ảnh hưởng
      ├─ số order
      ├─ thời điểm mua gần nhất
      └─ rating nếu có
           │
           ├─ Content-based similarity
           ├─ Collaborative filtering
           └─ Popularity
                 │
                 ▼
           Personalized ranking

- Lịch sử dưới 3 sản phẩm: không ép collaborative filtering.
- Lịch sử ngắn dùng content/popularity nhiều hơn.
- Rating 4–5 tăng tín hiệu; rating 1–2 giảm tín hiệu.
- Không có lịch sử sẽ fallback sang trending.

Ví dụ:

    {
      "user_id": "user-uuid",
      "mode": "personalized",
      "discovery": true,
      "top_k": 5
    }

### similar

Gợi ý món tương tự sản phẩm đang xem.

    {
      "product_id": 3,
      "mode": "similar",
      "top_k": 5
    }

- Bắt buộc có product_id.
- Loại chính sản phẩm đang xem.
- Chỉ dùng content similarity.
- Không trộn popularity vào điểm similar.
- Nếu không có món tương tự, response ghi strategy fallback thực tế là
  trending và có fallback_reason.

### trending

Gợi ý món phổ biến trong cửa sổ cấu hình
RECOMMENDATION_TRENDING_WINDOW_DAYS.

    {
      "mode": "trending",
      "top_k": 5
    }

Được dùng cho user ẩn danh, user mới, user không có lịch sử hoặc personalized
không tạo được candidate hợp lệ.

Nếu cửa sổ gần đây không có dữ liệu, hệ thống có thể dùng popularity cũ hơn và
ghi fallback_reason=no_recent_activity.

### reorder

Gợi ý mua lại các món user đã từng mua.

    {
      "user_id": "user-uuid",
      "mode": "reorder",
      "top_k": 5
    }

- Chỉ lấy sản phẩm trong lịch sử mua.
- Không loại món đã mua.
- Xếp theo quantity, số order, recency và rating.
- Tách biệt với discovery recommendation.

## 4. Nguồn dữ liệu

### Live mode hoac local

Live mode là mặc định:

    RECOMMENDATION_SOURCE_MODE=live
    DATA_API_BASE_URL=https://backend-internal.example
    DATA_API_KEY=<service-key>
    RECOMMENDATION_SNAPSHOT_PATH=/api/ai/recommendation/snapshot
    RECOMMENDATION_VIEWER_PATH=/api/ai/recommendation/viewer


Bật demo mode và chạy service:

$env:RECOMMENDATION_SOURCE_MODE="demo"
python -m uvicorn src.app.main:app --reload --port 8000

AI service gọi:

- GET /api/ai/recommendation/snapshot
  - Trả catalog active/available và interaction aggregate.
  - Nhận branch_id để lọc theo chi nhánh.
- GET /api/ai/recommendation/viewer
  - Nhận Authorization.
  - Trả user ID được backend suy ra từ access token.

Khi live API lỗi hoặc chưa cấu hình, endpoint recommendation trả HTTP 503.
Không tự động chuyển sang mock.

### Demo mode

Chỉ dùng mock khi bật rõ:

    $env:RECOMMENDATION_SOURCE_MODE = "demo"

Nguồn demo:

    src/app/recommendation/data_mock/products.csv
    src/app/recommendation/data_mock/user_item_summary.csv

## 5. Dữ liệu được dùng

Mapping theo db_smart_cafe.txt:

| Nhóm | Bảng/trường chính | Cách sử dụng |
|---|---|---|
| Catalog | Products, Categories | Tên, mô tả, category, temperature, caffeine, flavor tags |
| Giá | Product_Variants.price | Lấy giá variant active |
| Trạng thái món | Products.status, Categories.status, Product_Variants.status | Chỉ lấy dữ liệu active |
| Chi nhánh | Branch_Product_Availability | Lọc món có thể bán tại branch |
| User | Users.id, Users.status | Xác thực và liên kết lịch sử |
| Purchase | Orders, Order_Items | Quantity, số order, thời điểm mua |
| Rating | Verified_Purchases, Product_Reviews | Chỉ dùng review Approved |
| Tracking | AI_Recommendations | Schema dành cho impression/click/purchase tracking |

Đơn Cancelled, Rejected, Pending_Payment và đơn chưa hoàn tất không được dùng
làm purchase signal. Đơn đã refund toàn bộ không đóng góp. Preference về độ
ngọt, đá hoặc topping chưa được suy diễn nếu backend chưa cung cấp aggregate
đáng tin cậy.

## 6. Cache và cấu hình

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---:|---|
| RECOMMENDATION_SOURCE_MODE | live | live hoặc demo |
| RECOMMENDATION_CACHE_TTL_SECONDS | 300 | TTL model snapshot |
| RECOMMENDATION_RECENCY_HALF_LIFE_DAYS | 60 | Half-life của purchase signal |
| RECOMMENDATION_TRENDING_WINDOW_DAYS | 30 | Cửa sổ popularity gần đây |
| RECOMMENDATION_MAX_QUANTITY_SIGNAL | 8 | Cap quantity signal |
| RECOMMENDATION_MAX_ORDER_SIGNAL | 20 | Cap order signal |
| RECOMMENDATION_MODEL_VERSION | hybrid-v2 | Version hiển thị trong response |

Cache được lưu riêng theo branch_id. Khi snapshot mới xây lỗi, model cũ vẫn
được giữ nguyên; model mới chỉ thay thế sau khi xây thành công.

Có thể refresh thủ công trong worker:

    from src.app.recommendation.service.recommendation_service import (
        clear_recommendation_service_cache,
    )

    clear_recommendation_service_cache()

## 7. Evaluation

Chạy temporal evaluation trên dữ liệu mock:

    python scripts/evaluate_recommendation.py --days 30 --top-k 5
      --output evaluation/recommendation_metrics.json

Evaluator:

- Chia train/test theo thời gian.
- Chỉ fit model bằng train data.
- Discovery loại các sản phẩm đã mua trước cutoff.
- Đánh giá riêng future repeat cho reorder.
- Báo Precision@K, Recall@K và NDCG@K.

Kết quả mock không đại diện cho hiệu năng production.
