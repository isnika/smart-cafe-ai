# Smart Café Forecasting

## Chạy local với demo

Forecasting mặc định là `live`; demo phải bật tường minh:

```powershell
$env:FORECASTING_SOURCE_MODE = "demo"
uvicorn src.app.main:app --reload
```

Các endpoint giữ nguyên:

```text
POST /api/forecasting
POST /api/forecasting/products
POST /api/forecasting/inventory
```

Request doanh thu:

```json
{"start_date":"2026-10-19","days":3,"branch_id":1}
```

Request product:

```json
{"target_date":"2026-10-19","branch_id":1}
```

Request inventory (the optional `days` defaults to `1`):

```json
{"target_date":"2026-10-19","days":3,"branch_id":1}
```

`branch_id` được truyền xuyên suốt và là bắt buộc ở live mode. Demo chỉ tự chọn
branch khi fixture có đúng một branch; không có semantics “null = toàn hệ thống”.
Header `Authorization` (nếu có) được forward nguyên vẹn tới backend snapshot;
backend chịu trách nhiệm kiểm tra caller có quyền trên branch đó.

## Mapping schema → snapshot

Spring Boot vẫn sở hữu database. AI service không kết nối trực tiếp MySQL.
Adapter live đọc snapshot read-only từ `FORECASTING_SNAPSHOT_PATH`.

- `Orders.id`, `branch_id`, `created_at`, `status`, `payment_status`,
  `final_amount` → `orders.order_id`, `branch_id`, `order_time`, trạng thái và
  `order_total_vnd`.
- `Order_Items.order_id`, `product_id`, `variant_id`, `quantity` → demand theo
  variant. Live bắt buộc có `variant_id`; AI service không tự chia product xuống
  nhiều variant.
- `Recipes.variant_id`, `ingredient_id`, `quantity_required` → công thức tiêu hao.
- `Inventories.branch_id`, `ingredient_id`, `quantity_in_stock`,
  `reserved_quantity`, `reorder_level` → tồn khả dụng và đề xuất mua.
- `Branches.timezone` → timezone nghiệp vụ của snapshot.

Revenue dùng `final_amount`/`order_total_vnd` sau lọc `Completed` và payment
được ghi nhận. `Partially_Refunded` chỉ được tính nếu snapshot có
`refunded_amount_vnd`; `Refunded` đóng góp doanh thu bằng 0. Product demand dùng
item của order `Completed`; refund sau khi hoàn tất không tự xóa tiêu hao vì
schema không chứng minh món đã được hoàn nguyên. Đây là giới hạn nghiệp vụ cần
backend xác nhận bằng inventory events nếu muốn chính xác hơn.

## Contract live đề xuất

`GET {FORECASTING_DATA_API_BASE_URL}{FORECASTING_SNAPSHOT_PATH}?branch_id=1`

Backend cần trả JSON có các trường:

```json
{
  "version": "orders-cursor-v1",
  "generated_at": "2026-10-18T18:00:00Z",
  "complete_through": "2026-10-18",
  "coverage_complete": true,
  "timezone": "Asia/Ho_Chi_Minh",
  "orders": [],
  "order_items": [],
  "recipes": [],
  "inventory": []
}
```

`coverage_complete=true` là bắt buộc để AI service được phép điền 0 cho ngày
không có giao dịch trong khoảng dữ liệu hoàn chỉnh. Khi snapshot lỗi, live mode
trả lỗi; không tự chuyển sang CSV demo. Backend endpoint này hiện chưa được xác
nhận là đã triển khai trong repository này.

## Thuật toán và đánh giá

- Revenue features: calendar, lag 1/7/14, rolling mean 7/28 với shift trước
  rolling; forecast nhiều bước dùng recursive predictions.
- Candidates: `SeasonalNaive`, `WeekdayMean8Weeks`, `RandomForestRegressor`,
  `ExtraTreesRegressor`, `HistGradientBoostingRegressor`.
- Model chọn bằng rolling-origin validation; fold cuối giữ riêng làm test.
- Metrics: MAE, RMSE, WAPE. WAPE là `N/A` nếu tổng actual bằng 0.
- Product demand là expected quantity trung bình các weekday trong 8 tuần gần
  nhất; `recommended_quantity` mới làm tròn theo nearest integer.
- Inventory usage giữ số thập phân và không tự đổi đơn vị. Thiếu recipe,
  inventory hoặc unit mismatch trả `status=insufficient_data`, không mặc định
  usage bằng 0.
- Không trả prediction interval vì chưa có phương pháp calibration/coverage.

## Cache và lưu forecast

Model cache theo source, branch, cấu hình, và fingerprint authorization live; TTL
được điều khiển bởi `FORECASTING_CACHE_TTL_SECONDS`. Refresh xây snapshot/model
mới trước, chỉ thay cache sau khi build thành công. Nếu refresh live thất bại và
đã có model cũ, response đánh dấu `stale=true`.

AI service hiện chưa ghi trực tiếp bảng `AI_Forecasts`. Schema này thuộc backend
Spring Boot; cần backend write adapter/idempotency contract riêng trước khi bật
lưu kết quả. Interface nội bộ `ForecastPersistenceRepository.save_run()` đã
được đặt ra để không buộc AI service tự mở kết nối database. Contract write đề
xuất cần nhận `run_id`, `branch_id`, `forecast_type`, `target_id`,
`forecast_date`, `predicted_value`, `model_version`, `raw_data` và dùng idempotency
theo `(run_id, branch_id, forecast_type, target_id, forecast_date)`; endpoint
write backend chưa được triển khai/xác nhận trong repository này.

## ROP and safety-stock policy

`POST /api/forecasting/inventory` accepts `days` (default `1`, maximum `90`).
`forecast_usage` is the total ingredient demand over H forecast days from predicted
variant quantities multiplied by recipes; `d_bar = forecast_usage / H`.

When data is sufficient, the policy uses `SS = z × sigma_d × sqrt(L)`,
`ROP = d_bar × L + SS`, and `DaysOfCover = available_stock / d_bar` (null when
`d_bar = 0`). Reorder is alerted when `available_stock <= ROP`, and
`recommended_purchase = max(0, d_bar × (L + H) + SS - available_stock)`.

`sigma_d` is sample standard deviation (`ddof=1`) of daily ingredient usage in
the latest 56-day history window. Missing calendar days are filled with zero only
when the snapshot has `coverage_complete=true`; dates use the branch business
timezone. `d_bar` never reuses the historical mean.

`L` comes from per-ingredient `inventory.lead_time_days`. If the snapshot does
not provide it, `INVENTORY_DEFAULT_LEAD_TIME_DAYS` may supply an explicit default;
without either source, lead time is missing. `z` uses
`statistics.NormalDist().inv_cdf` and `INVENTORY_SERVICE_LEVEL` (default `0.95`),
which must be strictly inside `(0.5, 0.999)`.

At least 14 history days and a usable lead time select
`method=rop_safety_stock`. Missing lead time or history selects
`method=heuristic_reorder_level`, with `reason` containing
`missing_lead_time` and/or `insufficient_history`; the existing `reorder_level`
formula remains the fallback. Missing recipe/inventory or a unit mismatch remains
`status=insufficient_data`; missing values are not replaced with zero.

Not implemented: shrinkage/waste, inbound stock, MOQ, pack size, and unit
conversion. These are not included in the response as if they were implemented.
