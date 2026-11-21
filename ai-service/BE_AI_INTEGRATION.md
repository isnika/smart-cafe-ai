# Hướng dẫn tích hợp Spring Boot ↔ AI Service Smart Café

Tài liệu này được đối chiếu từ code hiện tại trong repository, `db_smart_cafe.txt`,
`.env.example`, `docker-compose.yml`, tài liệu module và test. Đây là tài liệu
tích hợp theo implementation hiện có; các endpoint backend được gọi bởi adapter
AI nhưng chưa có code Spring Boot trong repository này được đánh dấu rõ là **chưa
xác nhận đã triển khai**.

## 1. Tóm tắt tình trạng

| Module | Endpoint AI hiện có | Nguồn đang phục vụ | Tình trạng tích hợp backend |
|---|---|---|---|
| Chatbot | `POST /chat`, `POST /chat/reindex` | Knowledge base file trong `src/app/chat/knowledge_base`; catalog/order live nếu `DATA_API_BASE_URL` được cấu hình | Chat API và adapter live đã có. Backend cần cung cấp catalog search và order lookup theo contract; code chưa đọc trực tiếp bảng `Knowledge_Base`, `Chat_Sessions` hoặc `Chat_Messages`. |
| Recommendation | `POST /api/recommendation` | Mặc định `live`; `demo` chỉ khi bật tường minh | Adapter snapshot và viewer đã có. `GET /api/ai/recommendation/snapshot` và `GET /api/ai/recommendation/viewer` là endpoint AI đang gọi theo cấu hình, nhưng chưa được xác nhận trong repo Spring Boot. |
| Forecasting | `POST /api/forecasting`, `/products`, `/inventory` | Mặc định `live`; `demo` chỉ khi bật tường minh | Adapter snapshot đã có, bắt buộc `branch_id` ở live. `GET /api/ai/forecasting/snapshot` là contract AI đang gọi, chưa được xác nhận đã triển khai. AI chưa ghi trực tiếp `AI_Forecasts`. |

FastAPI đăng ký các router tại `src/app/main.py:64-67`. Không có prefix `/api`
chung cho chatbot: route chatbot là `/chat`, trong khi recommendation và
forecasting có prefix `/api/...` ngay trong route.

### Kết luận ngắn

- BE cần làm ngay: tạo các read-only endpoint snapshot/search/viewer, query đúng
  branch và trạng thái nghiệp vụ, forward/kiểm tra authorization, đồng thời thống
  nhất URL thật trong environment.
- AI đã sẵn sàng ở mức adapter và serving contract: không cần AI kết nối SQL
  trực tiếp; live lỗi không tự rơi về mock.
- FE → BE → AI end-to-end chưa thể xác nhận từ repository này vì chưa có Spring
  Boot source/API server và credentials. HTTP smoke test nội bộ của FastAPI đã
  được chạy, nhưng không phải test với BE.

## 2. Luồng tích hợp thực tế

### A. Luồng phục vụ người dùng

Luồng mà backend nên expose cho FE là:

```text
FE → Spring Boot (xác thực, quyền user/branch) → AI Service
  → Spring Boot data API khi AI cần dữ liệu live
  → Spring Boot → FE
```

Trong repository hiện tại, frontend thử nghiệm gọi AI qua HTTP client tại
`frontend-test-chatbot/src/services/chatbotApi.ts:151-205`. Vite proxy tại
`frontend-test-chatbot/vite.config.ts` rewrite `/api` về AI service; đây là
đường test trực tiếp, chưa chứng minh có Spring Boot gateway.

- Không gửi toàn bộ database trong từng request.
- Chat gửi câu hỏi và history ngắn; catalog/order được AI gọi khi intent cần.
- Recommendation và forecasting lấy snapshot qua adapter, sau đó cache/model
  phục vụ nhiều request.
- Authorization user chỉ nên đi từ FE qua BE và AI dưới dạng header; BE vẫn là
  nơi kiểm tra token và quyền branch.

### B. Luồng dữ liệu nghiệp vụ

Backend cần tạo snapshot/response đã lọc từ database của mình:

1. Catalog search trả menu hiện hành theo query và branch.
2. Recommendation snapshot trả catalog hợp lệ và interaction aggregate, không
   trả email/tên/PII.
3. Forecasting snapshot trả orders, order items, recipes, inventory của đúng
   branch và metadata coverage/cutoff.
4. Có thể refresh theo TTL của AI; backend không cần gửi toàn bộ DB mỗi request.

Các path Backend mà AI service gọi theo contract triển khai này:

- `GET /api/ai/catalog/search?q=...&intent=...&branch_id=...` (service auth).
- `GET /api/ai/orders/{order_code}` (forward `Authorization` của user và service auth nếu cấu hình).
- `GET /api/ai/recommendation/viewer` (forward `Authorization` của user).
- `GET /api/ai/recommendation/snapshot?branch_id=...` (service-to-service auth).
- `GET /api/ai/forecasting/snapshot?branch_id=...` (service-to-service auth).

`DATA_API_CATALOG_PATH`, `DATA_API_ORDER_PATH`, `RECOMMENDATION_*_PATH` và
`FORECASTING_SNAPSHOT_PATH` vẫn cho phép override theo môi trường, nhưng default
phải giữ các path trên.

Các adapter AI đều dùng HTTP read-only. Chat dùng `httpx.AsyncClient` tại
`src/app/chat/live_data.py:296-360`; recommendation dùng HTTP GET tại
`src/app/recommendation/repository.py:202-282`; forecasting dùng HTTP GET tại
`src/app/forecasting/repository.py:273-334`.

## 3. Bảng API AI hiện có

Tất cả body của các POST là JSON (`Content-Type: application/json`). Response
thành công do Pydantic response model kiểm tra; lỗi validation của FastAPI là
`422` dạng `{"detail": [...]}`.

### 3.1 Chatbot

#### `POST /chat`

Bằng chứng: `src/app/api/routes/chat.py:10-38`, schema tại
`src/app/chat/schemas.py:8-47`.

| Field | Bắt buộc | Kiểu/giới hạn | Ý nghĩa |
|---|---:|---|---|
| `message` | Có | string, 1–2000 ký tự sau trim | Câu hỏi hiện tại |
| `history` | Không | array tối đa 30 phần tử | Mỗi phần tử có `role`=`user`/`assistant`, `content` 1–2000 ký tự |

Service chỉ dùng tối đa history gần nhất sau khi làm sạch; API không có
`session_id` và server không lưu state, theo `src/app/chat/context.py`.

Headers:

- `Authorization: Bearer <user-token>`: chỉ cần cho tra cứu trạng thái đơn khi
  operational order API bật; AI forward nguyên header cho BE.
- `X-Branch-Id: <int>`: tùy chọn, dùng khi câu hỏi cần availability theo branch.
  FastAPI validate giá trị `>= 1`.
- Không có header user bắt buộc cho câu hỏi knowledge/menu tĩnh.

Response:

```json
{
  "answer": "Câu trả lời tiếng Việt",
  "sources": [
    {
      "source": "operational-catalog-api",
      "category": "live-catalog",
      "heading": "Matcha latte",
      "score": 0.0,
      "content": ""
    }
  ]
}
```

`sources` có thể rỗng. `CHAT_SOURCE_MODE=off` bỏ source; `metadata` (mặc định)
giữ source/category/heading nhưng làm `score=0` và `content=""`; `full` trả
đầy đủ chunk. Logic tại `src/app/chat/service.py:18-32`.

Lỗi thực tế:

- `422`: body sai schema.
- `429`: rate limit chatbot, mặc định 60 request/phút/instance, tại
  `src/app/core/security.py:16-61`.
- `503`: lỗi service/LLM hoặc live catalog/order không phục vụ được; route không
  trả chi tiết nội bộ, tại `src/app/api/routes/chat.py:25-38`.

#### `POST /chat/reindex`

Không có body. Cần `X-Reindex-Key` khớp `CHAT_REINDEX_API_KEY`. Response thành
công: `{"chunks": <integer>}`. `403` nếu key sai, `503` nếu chưa cấu hình key,
`500` nếu reindex lỗi. Route và quyền nằm tại `src/app/api/routes/chat.py:40-58`
và `src/app/core/security.py:64-75`.

### 3.2 Recommendation

#### `POST /api/recommendation`

Bằng chứng: `src/app/api/routes/recommendation.py:15-81` và
`src/app/recommendation/schemas/schemas.py:9-47`.

| Field | Bắt buộc | Kiểu/giới hạn | Default/ghi chú |
|---|---:|---|---|
| `user_id` | Không | string hoặc null | Live personalized/reorder không được tin cậy từ client; AI lấy user hiện tại qua viewer API |
| `product_id` | Không | integer hoặc null | Bắt buộc khi `mode=similar`; món đang xem sẽ bị loại khỏi kết quả |
| `mode` | Không | `personalized` | `similar` | `trending` | `reorder` | Nếu bỏ trống service tự suy ra từ user/product/auth |
| `discovery` | Không | boolean | `false`; personalized discovery mới loại món đã mua |
| `top_k` | Không | integer 1–50 | `5` |

Headers:

- `Authorization`: bắt buộc nếu live và mode thực tế là `personalized` hoặc
  `reorder`. Route gọi viewer API để xác định user và trả `401` nếu thiếu.
- `X-Branch-Id`: tùy chọn, integer `>=1`; được dùng để chọn snapshot branch. Code
  hiện chấp nhận null nên nếu BE cần isolation branch phải luôn gửi header hoặc
  chốt thay đổi contract để bắt buộc branch.
- AI adapter gửi `X-API-Key` tới backend nếu `DATA_API_KEY` có cấu hình.

Response thành công:

```json
{
  "user_id": "user-uuid-or-null",
  "product_id": null,
  "branch_id": 1,
  "strategy": "personalized",
  "fallback_reason": null,
  "discovery": false,
  "model_version": "hybrid-v2",
  "recommendations": [
    {
      "product_id": 3,
      "name": "Tên lấy từ catalog backend",
      "category": "Coffee",
      "price_vnd": 55000,
      "image": "",
      "score": 0.8123,
      "reason_code": "history_content",
      "reason": "Có đặc điểm gần với các món bạn từng chọn.",
      "strategy": "personalized",
      "recommendation_type": "History-Content"
    }
  ]
}
```

Đây là shape theo schema, không phải kết quả dữ liệu production. `score` là
điểm xếp hạng, không phải xác suất/confidence. Strategy/reason thực tế được tạo
tại `src/app/recommendation/service/recommendation_service.py:288-474`:

- `personalized`: content + item-item collaborative + popularity, trọng số
  thay đổi theo số dòng lịch sử; user ít dữ liệu có thể fallback trending.
- `similar`: content similarity, không trộn popularity khi có món tương tự.
- `trending`: popularity theo cửa sổ 30 ngày mặc định.
- `reorder`: lịch sử mua hợp lệ, tách khỏi discovery.

Lỗi:

- `400`: `mode=similar` thiếu `product_id`, product không tồn tại, mode/top_k
  không hợp lệ.
- `401`: live personalized/reorder thiếu Authorization.
- `403`: viewer không xác nhận được user hoặc `user_id` gửi lên khác user token.
- `503`: live snapshot/backend không khả dụng hoặc snapshot không hợp lệ.

### 3.3 Forecasting

Bằng chứng route tại `src/app/api/routes/forecasting.py:21-81`, schema tại
`src/app/forecasting/schemas.py:9-123`.

#### `POST /api/forecasting`

Request:

```json
{"start_date":"2026-11-16","days":7,"branch_id":1}
```

- `start_date`: bắt buộc, ISO date.
- `days`: mặc định `1`, giới hạn `1..90`.
- `branch_id`: integer `>=1` hoặc null theo schema, nhưng live repository thực
  tế yêu cầu branch và trả `400` khi thiếu.
- Forecasting snapshot dùng service-to-service credential (`X-API-Key`); không
  forward token người dùng vào snapshot. Token người dùng chỉ được forward cho
  order lookup và recommendation viewer.

Response gồm `start_date`, `days`, `branch_id`, `currency="VND"`, `model`,
`model_version`, validation/test metrics, `interval_available=false`,
`fallback_reason`, `metadata` và `forecast[]` với
`{date, predicted_revenue_vnd}`. Prediction không âm và serialize thành integer.
Prediction interval chưa được calibrate nên không được dùng `lower/upper`.

#### `POST /api/forecasting/products`

Request:

```json
{"target_date":"2026-11-16","branch_id":1}
```

Response `products[]` gồm `product_id`, `variant_id`, `product_name`,
`predicted_quantity` (có thể thập phân), `recommended_quantity` (nearest integer)
và `fallback_reason`. Method hiện tại là `WeekdayMean8Weeks`.

#### `POST /api/forecasting/inventory`

Dùng cùng request `target_date`/`branch_id`. Response `ingredients[]` gồm:

```json
{
  "ingredient_id": 5,
  "ingredient_name": "Sữa",
  "unit": "ml",
  "available_stock": 12000.0,
  "reorder_level": 3000.0,
  "forecast_usage": 2500.0,
  "recommended_purchase": 0.0,
  "status": "ok",
  "missing_data": []
}
```

Shape trên là ví dụ theo schema, không phải số liệu đã gọi BE. Công thức code hiện
tại là `predicted_variant_quantity × recipe.quantity_required`,
`available_stock = quantity_in_stock - reserved_quantity`, và
`recommended_purchase = max(0, usage + reorder_level - available)`. Không có
lead time, inbound, MOQ, pack size, conversion hay hao hụt trong response hiện
tại; thiếu recipe/inventory/unit mismatch trả `insufficient_data`, không mặc định
usage bằng 0.

Lỗi chung forecasting:

- `422`: body sai schema.
- `400`: branch thiếu ở live, ngày không sau `data_cutoff_date`, hoặc tham số
  không hợp lệ.
- `503`: snapshot live thiếu/sai dữ liệu hoặc upstream unavailable.
- `500`: lỗi nội bộ chưa được phân loại.

## 4. Dữ liệu backend cần cung cấp và mapping schema

### 4.1 Mapping database chung

| Nhu cầu AI | Bảng/cột schema | Adapter/field AI |
|---|---|---|
| Branch/timezone | `Branches.id`, `Branches.timezone`, `Branches.status` | `branch_id`, `timezone`; chỉ phục vụ branch active và đúng quyền |
| Menu | `Categories.id/name/status`, `Products.id/category_id/name/image/description/temperature/caffeine_level/flavor_tags/status`, `Product_Variants.id/product_id/variant_name/price/status` | Product `product_id`, `name`, `category`, mô tả/thuộc tính, `price_vnd`, active/available |
| Availability | `Branch_Product_Availability.branch_id/variant_id/is_available/unavailable_reason` | `is_available`; không có row nghĩa là available theo schema, nhưng phải áp dụng cả Product/Variant active |
| Người dùng | `Users.id/status` | Chỉ dùng `Users.id`/token-derived user id; không gửi email, tên hay PII |
| Đơn | `Orders.id/order_code/user_id/branch_id/status/payment_status/final_amount/created_at/completed_at` | Forecast order `order_id`, `branch_id`, `order_time`, status/payment, `order_total_vnd` |
| Chi tiết đơn | `Order_Items.order_id/product_id/variant_id/product_name/variant_name/quantity` | Demand item, bắt buộc `variant_id` cho live forecasting |
| Rating | `Verified_Purchases`; `Product_Reviews.product_id/user_id/order_item_id/rating/status` | Recommendation `rating`; chỉ review `Approved` nối đúng verified purchase |
| Recipe | `Recipes.variant_id/ingredient_id/quantity_required` | Forecast recipe theo variant, không ghép bằng product_id |
| Ingredient/inventory | `Ingredients.id/name/unit/is_active`; `Inventories.branch_id/ingredient_id/quantity_in_stock/reserved_quantity/reorder_level/average_cost` | Forecast inventory fields; unit phải khớp recipe |
| Lưu kết quả | `AI_Forecasts` và `AI_Recommendations` | Chỉ là schema backend; AI hiện chưa có implementation ghi vào hai bảng |

Bằng chứng schema: catalog tại `db_smart_cafe.txt:186-248`, branch tại
`db_smart_cafe.txt:356-370`, order/order item tại `db_smart_cafe.txt:573-665`,
inventory/recipe tại `db_smart_cafe.txt:1055-1117`, review tại
`db_smart_cafe.txt:1346-1371`, AI tables tại `db_smart_cafe.txt:1489-1534`.

### 4.2 Snapshot recommendation

AI gọi:

```text
GET {DATA_API_BASE_URL}{RECOMMENDATION_SNAPSHOT_PATH}?branch_id=<id>
GET {DATA_API_BASE_URL}{RECOMMENDATION_VIEWER_PATH}
```

Mặc định path lần lượt là `/api/ai/recommendation/snapshot` và
`/api/ai/recommendation/viewer`, từ `src/app/recommendation/config.py:35-74`.

Snapshot tối thiểu mà adapter parse được:

```json
{
  "version": "catalog-orders-2026-11-14T10:00:00Z",
  "generated_at": "2026-11-14T10:00:00Z",
  "products": [
    {
      "product_id": 3,
      "name": "Matcha latte",
      "category": "Coffee",
      "description": "Matcha với sữa",
      "temperature": "Hot_Or_Iced",
      "caffeine_level": "Medium",
      "flavor_tags": ["matcha", "milky"],
      "price_vnd": 55000,
      "is_active": true,
      "is_available": true
    }
  ],
  "interactions": [
    {
      "user_id": "user-uuid",
      "product_id": 3,
      "quantity": 4,
      "n_orders": 3,
      "last_purchase": "2026-11-10T10:00:00Z",
      "rating": 5
    }
  ]
}
```

Adapter cũng chấp nhận payload bọc `data`, key catalog là `products`/`catalog`,
interaction là `interactions`/`user_item_summary`/`user_product_interactions`,
theo `src/app/recommendation/repository.py:57-79,245-281`.

Backend phải aggregate trước khi trả:

- Catalog: Product/Category/Variant active, giá từ active variant; branch
  availability áp dụng đúng rule `no row OR is_available=true`.
- Interactions: chỉ đơn đã hoàn tất và dữ liệu đủ chứng minh mua; không dùng đơn
  hủy/rejected/pending. `Refunded` không nên đóng góp yêu thích; partial refund
  cần backend xác định quantity hợp lệ trước khi aggregate.
- Rating: chỉ `Product_Reviews.status='Approved'` và verified purchase; thiếu
  rating trả `null`, không biến thành dislike.
- `quantity`, `n_orders`, `last_purchase` phải là aggregate theo `(user_id,
  product_id)`. AI tự cap quantity/order và xử lý recency.

Viewer response tối thiểu:

```json
{"user_id":"user-uuid"}
```

AI forward `Authorization` và BE phải suy ra user từ token. Không dùng
`user_id` trong request để cấp quyền đọc lịch sử của user khác.

### 4.3 Snapshot forecasting

AI gọi:

```text
GET {FORECASTING_DATA_API_BASE_URL}{FORECASTING_SNAPSHOT_PATH}?branch_id=<id>
```

Mặc định path là `/api/ai/forecasting/snapshot`; config tại
`src/app/forecasting/config.py:14-68`, adapter tại
`src/app/forecasting/repository.py:291-334`. Contract tối thiểu:

```json
{
  "version": "orders-cursor-v1",
  "generated_at": "2026-11-15T10:00:00Z",
  "complete_through": "2026-11-14",
  "coverage_complete": true,
  "timezone": "Asia/Ho_Chi_Minh",
  "orders": [
    {
      "order_id": "1001",
      "branch_id": 1,
      "order_time": "2026-11-14T03:00:00Z",
      "order_total_vnd": 120000,
      "order_status": "Completed",
      "payment_status": "Paid"
    }
  ],
  "order_items": [
    {
      "order_id": "1001",
      "branch_id": 1,
      "product_id": 3,
      "variant_id": 31,
      "product_name": "Matcha latte",
      "quantity": 2
    }
  ],
  "recipes": [
    {
      "branch_id": 1,
      "variant_id": 31,
      "ingredient_id": 5,
      "ingredient_name": "Sữa",
      "quantity_required": 250,
      "unit": "ml"
    }
  ],
  "inventory": [
    {
      "branch_id": 1,
      "ingredient_id": 5,
      "ingredient_name": "Sữa",
      "unit": "ml",
      "quantity_in_stock": 12000,
      "reserved_quantity": 500,
      "reorder_level": 3000
    }
  ]
}
```

Các field bắt buộc thực tế được kiểm tra tại
`src/app/forecasting/preprocessing.py:42-213`:

- orders: `order_id`, `branch_id`, `order_time` (có alias `created_at`),
  `order_total_vnd` (alias `final_amount`). `order_status` mặc định Completed
  và `payment_status` mặc định Paid nếu snapshot không có, vì vậy BE production
  phải gửi rõ hai field để không làm sai nghiệp vụ.
- order items: `order_id`, `branch_id`, `product_id`, `quantity`; live phải có
  `variant_id` cho mọi dòng, không phân bổ product demand xuống variant.
- recipes: `variant_id`, `ingredient_id`, `quantity_required`, `unit`.
- inventory: `branch_id`, `ingredient_id`, `ingredient_name`, `unit`,
  `quantity_in_stock`, `reserved_quantity`, `reorder_level`.

Quy tắc đang chạy:

- Revenue dùng order `Completed`, payment `Paid`/`Partially_Refunded`/`Refunded`;
  partial refund cần `refunded_amount_vnd`, refunded hoàn toàn góp `0`; ngày
  hiện tại lấy từ `order_time`/`created_at` theo timezone snapshot. Code không dùng
  `completed_at` hiện tại: `src/app/forecasting/service.py:116-168`.
- Product demand dùng item của order `Completed`; refund sau khi món đã hoàn tất
  không tự xóa consumption, vì snapshot hiện không có cờ món đã chế biến/restock.
- `coverage_complete=true` là bắt buộc ở live để phân biệt ngày không bán với
  ngày thiếu dữ liệu; AI mới được zero-fill khoảng giữa mốc đầu và
  `complete_through`.
- Recipe/inventory phải cùng đơn vị; không tự đổi `g`↔`kg` hoặc `ml`↔`l`.

### 4.4 Chatbot data

Chatbot hiện không đọc API `Knowledge_Base` trong schema. Retriever đọc file
`src/app/chat/knowledge_base/products.csv` và các `.md/.txt` trong thư mục đó,
theo `src/app/chat/retriever.py:35-44,351-457`. Vì vậy:

- BE chưa cần gửi knowledge trong mỗi request.
- Nếu muốn dùng bảng `Knowledge_Base` thật, cần thêm một adapter/snapshot riêng
  hoặc job đồng bộ file; hiện chưa có endpoint/code chứng minh việc này.
- Khi đã cấu hình `DATA_API_BASE_URL`, lỗi catalog live không rơi về catalog tĩnh
  cho các câu hỏi menu hiện hành; đây là guard tại `RAGPipeline.answer()` và
  `src/app/chat/live_data.py:304-321`.
- Chat_Sessions/Chat_Messages có trong schema nhưng AI hiện không lưu/đọc chúng;
  client phải gửi `history` trong mỗi request.

## 5. Cấu hình và xác thực

### AI → backend

Các adapter gửi:

- `Accept: application/json`.
- `X-API-Key: <DATA_API_KEY>` nếu cấu hình.
- `Authorization` nguyên vẹn chỉ cho order lookup và recommendation viewer.
  Recommendation/forecasting snapshot dùng `X-API-Key` service-to-service.

Code tạo headers tại `src/app/chat/live_data.py:288-294`,
`src/app/recommendation/repository.py:212-218` và
`src/app/forecasting/repository.py:283-289`.

Backend nên dùng API key/service credential riêng cho AI, timeout 3 giây mặc định
(giới hạn config 0.2–30 giây), và vẫn tự kiểm tra JWT/user/branch khi nhận
Authorization. Không log token, API key, URL chứa order code hoặc PII.

### Localhost

Ví dụ PowerShell, dùng placeholder chứ không commit secret:

```powershell
$env:DATA_API_BASE_URL = "http://localhost:8080"
$env:DATA_API_KEY = "<service-api-key>"
$env:DATA_API_TIMEOUT_SECONDS = "3"
$env:RECOMMENDATION_SOURCE_MODE = "live"
$env:FORECASTING_SOURCE_MODE = "live"
$env:PRELOAD_CHAT = "false"
python -m uvicorn src.app.main:app --host 127.0.0.1 --port 8000
```

Nếu chỉ test dữ liệu CSV local, phải bật tường minh:

```powershell
$env:RECOMMENDATION_SOURCE_MODE = "demo"
$env:FORECASTING_SOURCE_MODE = "demo"
```

Demo không chứng minh tích hợp production và không được dùng như fallback khi
live lỗi.

### Docker

`docker-compose.yml` hiện chỉ có `ai-service` và frontend; không có service
Spring Boot. Nếu Spring Boot chạy trên host:

```env
DATA_API_BASE_URL=http://host.docker.internal:8080
FORECASTING_DATA_API_BASE_URL=http://host.docker.internal:8080
DATA_API_KEY=<service-api-key>
RECOMMENDATION_SOURCE_MODE=live
FORECASTING_SOURCE_MODE=live
```

Trong root `compose.yaml` hiện tại, gateway backend có service name là
`api-gateway`, vì vậy AI container dùng `DATA_API_BASE_URL=http://api-gateway:8080`.
Nếu triển khai bằng compose khác, thay bằng đúng service DNS và port nội bộ của
BE; không dùng `localhost` giữa các container.

## 6. Ví dụ gọi API

Các lệnh dưới đây là ví dụ contract, không phải response đã chạy với Spring Boot.

### Chatbot

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -H "X-Branch-Id: 1" \
  -d '{"message":"Matcha latte giá bao nhiêu?","history":[]}'
```

```powershell
$body = @{ message = "Matcha latte giá bao nhiêu?"; history = @() } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/chat" `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer <user-token>"; "X-Branch-Id" = "1" } `
  -Body $body
```

Xác nhận: HTTP `200`, có `answer` string và `sources` array. Với câu hỏi trạng
thái đơn, kiểm tra log/trace ở BE và endpoint order lookup; không gửi order code
cho AI nếu chưa có Authorization.

Reindex chỉ dành cho admin/internal:

```bash
curl -X POST http://localhost:8000/chat/reindex \
  -H "X-Reindex-Key: <chat-reindex-key>"
```

### Recommendation

```bash
curl -X POST http://localhost:8000/api/recommendation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -H "X-Branch-Id: 1" \
  -d '{"mode":"personalized","discovery":false,"top_k":5}'
```

```powershell
$body = @{ mode = "personalized"; discovery = $false; top_k = 5 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/recommendation" `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer <user-token>"; "X-Branch-Id" = "1" } `
  -Body $body
```

Xác nhận: HTTP `200`, `strategy` đúng mode thực tế, `branch_id` đúng, item không
trùng và có `reason_code`. Nếu live personalized trả `401/403/503`, đó là lỗi
auth/snapshot cần xử lý; không đổi `RECOMMENDATION_SOURCE_MODE` sang demo để che
lỗi.

Backend cũng cần thử hai request nội bộ sau (đây là endpoint AI đang gọi, chưa
phải endpoint đã xác nhận trong Spring Boot):

```bash
curl "http://localhost:8080/api/ai/recommendation/viewer" \
  -H "Accept: application/json" -H "X-API-Key: <service-api-key>" \
  -H "Authorization: Bearer <user-token>"
curl "http://localhost:8080/api/ai/recommendation/snapshot?branch_id=1" \
  -H "Accept: application/json" -H "X-API-Key: <service-api-key>"
```

### Forecasting

```bash
curl -X POST http://localhost:8000/api/forecasting \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-or-user-token>" \
  -d '{"start_date":"2026-11-16","days":7,"branch_id":1}'

curl -X POST http://localhost:8000/api/forecasting/products \
  -H "Content-Type: application/json" \
  -d '{"target_date":"2026-11-16","branch_id":1}'

curl -X POST http://localhost:8000/api/forecasting/inventory \
  -H "Content-Type: application/json" \
  -d '{"target_date":"2026-11-16","branch_id":1}'
```

```powershell
$headers = @{ Authorization = "Bearer <service-or-user-token>" }
$revenue = @{ start_date = "2026-11-16"; days = 7; branch_id = 1 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/forecasting" `
  -ContentType "application/json" -Headers $headers -Body $revenue

$target = @{ target_date = "2026-11-16"; branch_id = 1 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/forecasting/products" `
  -ContentType "application/json" -Headers $headers -Body $target
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/forecasting/inventory" `
  -ContentType "application/json" -Headers $headers -Body $target
```

Xác nhận revenue: `metadata.data_cutoff_date`, `forecast_origin` và `branch_id`
đúng; `forecast` bắt đầu sau cutoff. Xác nhận product/inventory: variant và
ingredient branch đúng, không có unit mismatch bị che thành usage 0.

## 7. Checklist Spring Boot

### Ưu tiên P0 — bắt buộc để live chạy

- [ ] Chốt service base URL thật và path thật cho catalog, order, recommendation
  snapshot/viewer, forecasting snapshot.
- [ ] Cấp service-to-service credential cho AI; lưu trong secret manager, không
  commit vào `.env.example`/log.
- [ ] Implement `GET catalog search` nhận `q`, `intent`, `branch_id`; chỉ trả
  Product/Category/Variant active và availability branch đúng schema.
- [ ] Implement `GET /api/ai/orders/{order_code}`; bắt buộc xác minh order
  thuộc user từ Authorization, không chỉ dựa mã đơn.
- [ ] Implement `GET recommendation snapshot`; trả version/generated_at, catalog
  active và interaction aggregate theo contract. Không trả PII.
- [ ] Implement `GET recommendation viewer`; trả user id suy ra từ token và trả
  401/403 đúng khi token không hợp lệ.
- [ ] Implement `GET forecasting snapshot?branch_id=`; lọc đúng branch, gửi đủ
  orders/items/recipes/inventory, `complete_through`, `coverage_complete=true`,
  timezone và version.
- [ ] Đảm bảo order snapshot không nhân đôi khi join Orders–Order_Items; id/order
  item phải ổn định và snapshot có version/cursor.

### P1 — nghiệp vụ và vận hành

- [ ] Revenue dùng rõ `final_amount`, `created_at` hay `completed_at`. Code AI hiện
  dùng `final_amount` và `created_at` alias (`order_time`); nếu nghiệp vụ muốn
  `completed_at`, phải chốt contract/chỉnh code trước production.
- [ ] Chốt partial refund: gửi `refunded_amount_vnd` hoặc aggregate net revenue
  ở backend. Không áp dụng quy tắc refund doanh thu cho demand/consumption.
- [ ] Chốt refund có `restock_inventory`/inventory event hay không; code AI hiện
  giữ demand của order Completed và không tự suy ra đã hoàn nguyên nguyên liệu.
- [ ] Chốt `reorder_level` là ngưỡng cảnh báo hay target/safety stock. AI hiện dùng
  nó như heuristic trong `usage + reorder_level - available` và không có lead time.
- [ ] Cung cấp timezone branch từ `Branches.timezone`; không dùng UTC tùy tiện cho
  ngày kinh doanh.
- [ ] Chốt phạm vi auth cho `branch_id` và reject branch user không được phép.
- [ ] Trả request/correlation id hoặc cho phép BE gateway gắn `X-Request-ID`; AI
  hiện không có contract response field request id.
- [ ] Cache snapshot/backend có version hoặc ETag; khi dữ liệu thay đổi, AI TTL
  hiện tại là 300 giây mặc định.

### P2 — lưu kết quả và chất lượng

- [ ] Nếu cần lưu forecast, triển khai endpoint write backend idempotent cho
  `AI_Forecasts` theo unique `(run_id, branch_id, forecast_type, target_id,
  forecast_date)`. AI hiện chỉ có Protocol `ForecastPersistenceRepository`,
  chưa có adapter gọi write.
- [ ] Chốt map `Revenue` target_id=0, `Product_Demand` target_id=variant_id,
  `Ingredient_Usage` target_id=ingredient_id theo `db_smart_cafe.txt:1494-1517`.
- [ ] Nếu lưu recommendation, chốt event/click/purchase pipeline cho
  `AI_Recommendations`; route AI hiện chỉ trả response và không ghi bảng.
- [ ] Cung cấp actual backfill có branch/run/model version để đánh giá, không sửa
  ngược forecast history không có audit.

### Retry/error

- [ ] Retry có backoff chỉ cho GET snapshot/search/viewer và chỉ khi timeout/5xx;
  giữ timeout ngắn và request id.
- [ ] Không retry mù `POST` phục vụ nghiệp vụ người dùng nếu BE có side effect.
- [ ] Với AI `503`, BE trả lỗi tạm thời rõ ràng cho FE hoặc dùng cache kết quả cũ
  có trạng thái stale; không bật demo âm thầm.
- [ ] Log status, latency, request id, branch và model/version; không log token,
  API key, order code đầy đủ hay lịch sử user.

## 8. Checklist AI

- [x] Route và response schema cho cả ba module đã có; OpenAPI runtime sinh từ
  `src/app/main.py`.
- [x] Chat có rate limit, source redaction, order authorization forwarding và
  không trả fallback catalog cũ khi live catalog lỗi.
- [x] Recommendation có live/demo tách biệt, viewer authorization, branch-aware
  snapshot cache, fallback strategy và không tự dùng demo khi live lỗi.
- [x] Forecasting có live/demo tách biệt, branch-aware cache, cutoff/timezone,
  validation schema, variant recipe và thiếu dữ liệu rõ ràng.
- [ ] AI chưa có endpoint/adapter đọc bảng `Knowledge_Base` thật; hiện dùng file.
- [ ] AI chưa biết chắc các endpoint `/api/ai/...` đã tồn tại ở BE vì repository
  không chứa Spring Boot.
- [ ] AI chưa ghi `AI_Forecasts` hoặc `AI_Recommendations`.
- [ ] Cần chốt branch bắt buộc cho recommendation; code hiện cho phép null.
- [ ] Cần chốt auth contract: hiện recommendation viewer dùng user token, còn
  snapshot forecasting/recommendation có thể dùng service key và forward token.
- [ ] Cần test contract với response thực của BE, đặc biệt partial refund,
  `coverage_complete`, timezone và unit.

## 9. Kịch bản kiểm thử end-to-end

### Contract smoke test

1. Chạy Spring Boot ở URL đã chốt, gọi `/health`/endpoint readiness của BE.
2. Từ AI container gọi catalog search không có branch và có branch; kiểm tra active
   status và availability.
3. Gọi order lookup bằng token đúng user, token user khác và không token; expected
   lần lượt chỉ user sở hữu mới xem được, còn lại `401/403`/404 theo policy BE.
4. Gọi recommendation viewer/snapshot với branch 1 và branch 2; xác nhận version,
   user id và catalog/interactions không trộn.
5. Gọi forecasting snapshot với branch 1; kiểm tra `coverage_complete`, cutoff,
   timezone, variant_id, recipe unit và inventory branch.
6. Gọi ba POST AI qua HTTP thực; kiểm tra response `metadata`/strategy/branch.

### Nghiệp vụ tối thiểu

- Tạo order Completed/Paid: xuất hiện trong revenue, demand và interaction sau
  refresh.
- Tạo Cancelled/Rejected/Pending: không xuất hiện trong revenue/demand.
- Full refund: revenue contribution bằng 0; demand/ingredient xử lý theo cờ
  restock thực tế đã chốt, không suy diễn từ payment status.
- Partial refund: thiếu amount phải làm snapshot lỗi, không coi là doanh thu 0.
- Hai ngày không bán trong snapshot complete: được zero-fill; ngày outage không
  `coverage_complete` phải bị từ chối.
- Recipe theo variant A nhưng order item variant B: không được ghép nhầm.
- `g` recipe với `kg` inventory: `insufficient_data`, không tự quy đổi.
- User A gọi recommendation với user B trong body: live phải `403`; không rò
  history.
- Không có live backend: AI live phải `503`, không trả CSV demo.

### Kiểm tra bằng chứng đã chạy trong môi trường này

Đã chạy:

```text
python -c "... TestClient(app) ..."
```

Kết quả thực tế:

- `GET /openapi.json`: `200`; có đủ `/chat`, `/chat/reindex`,
  `/api/recommendation`, `/api/forecasting`, `/api/forecasting/products`,
  `/api/forecasting/inventory`.
- Body rỗng cho `/chat`: `422`.
- `top_k=0` cho recommendation: `422`.
- Forecast revenue thiếu `branch_id` trong môi trường live: `400`.

Đây là HTTP-level test với FastAPI app/TestClient, không phải gọi Spring Boot và
không chứng minh live data đã kết nối.

Đã chạy test command:

```text
python -m pytest -q tests/chat tests/recommendation tests/forecasting
```

Output chạy tới `[100%]` không có failure; có một warning môi trường Windows từ
`joblib` về không tìm được số core vật lý. Không có test HTTP end-to-end với
Spring Boot vì repo hiện tại không chứa backend server/credentials.

## 10. Blocker và câu hỏi cần chốt với BE

1. URL/path thật của năm endpoint backend là gì? Hiện AI chỉ có default path,
   trong đó forecasting README ghi rõ snapshot là contract đề xuất chưa xác nhận.
2. Ai chịu trách nhiệm xác minh `Authorization`: BE gateway, AI adapter hay cả
   hai? Viewer/order phải trả status nào khi user không sở hữu dữ liệu?
3. Recommendation có bắt buộc branch không? Nếu không gửi branch, backend
   snapshot có được phép aggregate toàn hệ thống không? Code AI hiện cho phép null.
4. `Orders.created_at` hay `completed_at` là ngày ghi nhận revenue/demand?
5. Partial/full refund có restock nguyên liệu không, và event nào là source of
   truth? `payment_status` một mình không đủ để kết luận consumption.
6. Snapshot coverage có cursor/version và cách xác nhận không có outage như thế
   nào? `coverage_complete=true` cần semantics rõ.
7. Recipe/inventory có dùng base unit chung hay cần conversion từ
   `PO_Details.conversion_factor`? AI hiện không đọc conversion.
8. Có cần AI ghi `AI_Forecasts`/`AI_Recommendations` không? Nếu có, endpoint write,
   idempotency, run_id và retry policy là gì?
9. Knowledge base production sẽ lấy từ file deploy hay bảng `Knowledge_Base`?
   Nếu từ bảng, cần API/sync contract và filter `audience/status/language`.
10. FE production gọi BE gateway hay gọi AI trực tiếp? Repo frontend hiện chỉ cho
    thấy proxy tới AI.

## 11. Kết luận triển khai

### BE cần làm ngay

1. Chốt và triển khai read-only catalog/order/snapshot/viewer APIs.
2. Query đúng các bảng/cột trong mapping, lọc đúng status/branch/refund và trả
   version, cutoff, timezone/coverage.
3. Thiết lập service auth, user/branch authorization, timeout/retry/request-id.
4. Gọi thử các curl trong tài liệu từ cả host và AI container.
5. Chốt contract ghi `AI_Forecasts` nếu cần lưu kết quả.

### AI đã sẵn sàng

- Ba nhóm endpoint FastAPI, schema/validation, OpenAPI và test module đã có.
- Adapter HTTP read-only, demo/live explicit, branch propagation và các metadata
  serving đã có.
- Không có đường code kết nối thẳng database hoặc tự ghi production DB.

### Còn thiếu để FE → BE → AI chạy thành công

- Spring Boot API thật tương ứng với các adapter và base URL/credential hợp lệ.
- Quyết định nghiệp vụ về branch, thời gian revenue, partial refund/consumption,
  unit conversion và persistence.
- Kiểm thử contract thật giữa hai service; hiện mới kiểm chứng được FastAPI app
  và test data/fixtures trong repository.



