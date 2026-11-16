# Calculation Proof - Forecasting

## 1. Kết luận

| Hạng mục | Kết luận | Ý nghĩa |
| --- | --- | --- |
| Snapshot/source load | PASS | Đã dùng source_mode=demo |
| Nghiệp vụ revenue/schema | NOT VERIFIED | Demo không chứng minh production DB semantics. |
| Revenue source → daily series | PASS | Tính lại độc lập từ orders |
| Lag/rolling/no future feature | PASS | Đối chiếu trên cùng snapshot |
| Multi-step/service integration | PASS | Sai lệch serialize cho phép 0.5 VND |
| Product/variant demand | PASS | Đối chiếu weekday samples và expected quantity |
| Recipe/inventory arithmetic | PASS | Đối chiếu usage, stock, reorder heuristic |
| Model tốt hơn baseline trên test | FAIL | Không đặt ngưỡng nghiệp vụ |
| HTTP API | NOT VERIFIED | Chưa gọi server HTTP; direct service không phải HTTP smoke test |
| Forecast tương lai đúng/sai | NOT VERIFIED | Chưa có actual sau cutoff |

PASS ở đây chỉ chứng minh phép tính hoặc integration khớp implementation. Không đồng nghĩa forecast chính xác hoặc production-ready.

## 2. Lệnh chạy, source và cấu hình

- Command: python "C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\forecasting\calculation proof.py" --days 7 --backtest-horizon 7 --backtest-folds 3 --branch-id 1 --source-mode demo --output "C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\forecasting\calculation proof.md"
- Source mode thực tế: demo
- Source: data_mock CSV
- Branch: 1
- Timezone: Asia/Ho_Chi_Minh
- Data version: demo-orders.csv:4420651:1794322668715521100|order_items.csv:4987851:1794322668691470000|recipes.csv:483:1794322668717549000|inventory.csv:310:1794322668665817100
- Snapshot generated_at: 2026-11-10 14:57:48.717549+00:00
- Cutoff hoàn chỉnh: 2026-10-18
- Start date: 2026-10-19
- Days: 7
- Backtest horizon/folds: 7/3
- Model version: revenue-forecast-v3
- Model được chọn: WeekdayMean8Weeks
- Output: C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\forecasting\calculation proof.md

## 3. Luồng và công thức thực tế

- Route: api/routes/forecasting.py, các handler forecast, forecast_products, forecast_inventory.
- Request/response schemas: forecasting/schemas.py.
- Snapshot: forecasting/repository.py, ForecastingSnapshot, DemoForecastingRepository, OperationalForecastingRepository.
- Validation: forecasting/preprocessing.py.
- Revenue service: forecasting/service.py, RevenueForecastService._build_revenue_history và forecast.
- Features: forecasting/features.py, make_training_frame và make_future_features.
- Evaluation: forecasting/evaluation.py, rolling_origin_evaluation.
- Cache: forecasting/service.py, get_forecast_service và clear_forecast_service_cache.

Revenue: Completed + Paid dùng order_total_vnd; Partially_Refunded dùng order_total_vnd - refunded_amount_vnd; Refunded = 0. Ngày được chuyển về timezone branch trước khi group theo ngày.

Revenue features: calendar, lag_1, lag_7, lag_14, rolling_mean_7 = mean(shift(1)[-7:]), rolling_mean_28 = mean(shift(1)[-28:]).

Forecast multi-step: từng prediction được append vào history rồi dùng làm lag/rolling cho bước sau. Output revenue làm non-negative và round nearest integer ở bước phục vụ. Không có prediction interval được calibrate.

Product demand: mean quantity của tối đa 56 ngày gần cutoff cùng weekday; dưới 4 mẫu weekday thì backoff recent mean. Inventory: usage = sum(expected_variant_quantity × recipe_quantity) cùng unit; purchase = max(0, usage + reorder_level - available_stock).

Đối chiếu schema db_smart_cafe.txt: Orders/Order_Items, Recipes.variant_id, Inventories.branch_id/ingredient_id, Branches.timezone và AI_Forecasts. AI service không tự ghi database.

## 4. Kiểm chứng dữ liệu doanh thu

Revenue được tính từ Orders.final_amount/order_total_vnd, ghi nhận theo business date sau chuyển timezone branch. Pipeline chỉ dùng Completed; Paid dùng toàn bộ tiền, Partially_Refunded trừ refunded_amount_vnd, Refunded đóng góp 0. Order item không được join vào revenue.

| Hạng mục | Giá trị | Trạng thái |
| --- | --- | --- |
| Source mode | demo | PASS |
| Branch | 1 | PASS |
| Timezone | Asia/Ho_Chi_Minh | PASS |
| Data version | demo-orders.csv:4420651:1794322668715521100\|order_items.csv:4987851:1794322668691470000\|recipes.csv:483:1794322668717549000\|inventory.csv:310:1794322668665817100 | PASS |
| Snapshot generated_at | 2026-11-10 14:57:48.717549+00:00 | PASS |
| Complete through | 2026-10-18 | PASS |
| Orders trước normalize | 81629 | PASS |
| Orders sau normalize | 81629 | PASS |
| Order items trước normalize | 108579 | PASS |
| Order items sau join hợp lệ | 105446 | PASS |
| Orders invalid bị loại | 0 | PASS |
| Order item duplicate exact bị loại | 3133 | NOT VERIFIED |
| Coverage complete | True | PASS |
| Ngày được fill 0 | 0 | PASS |

### Trạng thái nghiệp vụ thực tế trong snapshot

| Loại | Phân bố |
| --- | --- |
| Order status | {'Completed': 81629} |
| Payment status | {'Paid': 81629} |
| Revenue loại theo status | {} |
| Revenue loại theo payment | {} |

Refund không áp dụng cùng một quy tắc cho mọi target: doanh thu giảm theo refund, còn completed order item vẫn được giữ cho demand/consumption vì snapshot không có inventory event chứng minh món đã được hoàn nguyên.

### Đối chiếu ngày mẫu

| Ngày | Số order accepted | Doanh thu tính lại | Daily series pipeline | Sai lệch | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| 2024-01-01 | 76 | 3840600 | 3840600 | 0 | PASS |
| 2026-10-18 | 89 | 4970200 | 4970200 | 0 | PASS |
| 2025-05-26 | 76 | 4273500 | 4273500 | 0 | PASS |

| Kiểm tra | Kết quả | Trạng thái |
| --- | --- | --- |
| Order id duplicate | False | PASS |
| Order-item join rows | 105446 | PASS |
| Revenue path join order-items | Không join; dùng orders trực tiếp | PASS |
| Max daily arithmetic delta | 0 | PASS |

Ngày không bán được fill 0 chỉ trong khoảng snapshot có coverage_complete=true. Ngày thiếu dữ liệu/outage không được tự coi là không bán; live snapshot thiếu cờ coverage sẽ bị từ chối.

## 5. Kiểm chứng features

Feature frame có 994 rows từ 2024-01-29 đến 2026-10-18; 28 ngày đầu bị loại vì lag/rolling chưa đủ dữ liệu.

Pipeline reference: make_training_frame trong src/app/forecasting/features.py. Tính lại độc lập bằng công thức shift trước rolling.

| Ngày | Feature | Dữ liệu dùng tính | Tính lại | Pipeline | Sai lệch | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | day_of_week | calendar only | 5 | 5 | 0 | PASS |
| 2026-10-17 | day_of_month | calendar only | 17 | 17 | 0 | PASS |
| 2026-10-17 | month | calendar only | 10 | 10 | 0 | PASS |
| 2026-10-17 | day_of_year | calendar only | 290 | 290 | 0 | PASS |
| 2026-10-17 | is_weekend | calendar only | 1 | 1 | 0 | PASS |
| 2026-10-17 | lag_1 | 2026-10-16 | 3502100 | 3502100 | 0 | PASS |
| 2026-10-17 | lag_7 | 2026-10-10 | 4862800 | 4862800 | 0 | PASS |
| 2026-10-17 | lag_14 | 2026-10-03 | 3020200 | 3020200 | 0 | PASS |
| 2026-10-17 | rolling_mean_7 | 2026-10-10..2026-10-16 | 3881242.8571428573 | 3881242.8571428573 | 0 | PASS |
| 2026-10-17 | rolling_mean_28 | 2026-09-19..2026-10-16 | 3997003.5714285714 | 3997003.5714285714 | 0 | PASS |
| 2026-10-18 | day_of_week | calendar only | 6 | 6 | 0 | PASS |
| 2026-10-18 | day_of_month | calendar only | 18 | 18 | 0 | PASS |
| 2026-10-18 | month | calendar only | 10 | 10 | 0 | PASS |
| 2026-10-18 | day_of_year | calendar only | 291 | 291 | 0 | PASS |
| 2026-10-18 | is_weekend | calendar only | 1 | 1 | 0 | PASS |
| 2026-10-18 | lag_1 | 2026-10-17 | 5040400 | 5040400 | 0 | PASS |
| 2026-10-18 | lag_7 | 2026-10-11 | 4531400 | 4531400 | 0 | PASS |
| 2026-10-18 | lag_14 | 2026-10-04 | 4294800 | 4294800 | 0 | PASS |
| 2026-10-18 | rolling_mean_7 | 2026-10-11..2026-10-17 | 3906614.2857142859 | 3906614.2857142859 | 0 | PASS |
| 2026-10-18 | rolling_mean_28 | 2026-09-20..2026-10-17 | 3970528.5714285714 | 3970528.5714285714 | 0 | PASS |

Feature target không dùng ngày tương lai: **PASS**.
Rolling dùng history.shift(1).rolling(...); target ngày T không nằm trong rolling window.

## 6. Đối chiếu forecast và multi-step

Forecast origin thực tế: 2026-10-19; requested start: 2026-10-19; requested horizon: 7; model: WeekdayMean8Weeks.
Warmup gap, nếu có, được recursive forecast từ cutoff nhưng không xuất hiện trong đoạn response yêu cầu. Chưa có actual tương lai nên đúng/sai forecast tương lai là NOT VERIFIED.

| step | target | phase | feature/input | prediction raw | after non-negative | tính lại serialize | service/API serialize | sai lệch | trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-19 | requested |  | 3447012.5 | 3447012.5 | 3447013 | 3447013 | 0 | PASS |
| 2 | 2026-10-20 | requested |  | 3726562.5 | 3726562.5 | 3726563 | 3726563 | 0 | PASS |
| 3 | 2026-10-21 | requested |  | 3751287.5 | 3751287.5 | 3751288 | 3751288 | 0 | PASS |
| 4 | 2026-10-22 | requested |  | 3683962.5 | 3683962.5 | 3683963 | 3683963 | 0 | PASS |
| 5 | 2026-10-23 | requested |  | 3942187.5 | 3942187.5 | 3942188 | 3942188 | 0 | PASS |
| 6 | 2026-10-24 | requested |  | 4968937.5 | 4968937.5 | 4968938 | 4968938 | 0 | PASS |
| 7 | 2026-10-25 | requested |  | 4755887.5 | 4755887.5 | 4755888 | 4755888 | 0 | PASS |

Service compare là đối chiếu integration với cùng model đã fit; không phải bằng chứng độc lập cho chất lượng của RandomForest/ExtraTrees/tree.
HTTP API POST /api/forecasting chưa được gọi trong công cụ này; direct service không được coi là HTTP end-to-end.

## 6. Kiểm chứng product/variant demand

Demand dùng order_items đã join với Orders và chỉ giữ order_status=Completed. Refund payment không xóa consumption completed vì schema hiện không có bằng chứng inventory hoàn nguyên. Công thức demo/current: mean của tối đa 56 ngày gần cutoff cùng weekday; nếu dưới 4 mẫu weekday thì backoff về mean toàn recent.

| product_id | variant_id | món | demand tính lại | mẫu số | ngày/quantity đóng góp | pipeline | sai lệch | trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | Espresso | 8.625 | 8 | 2026-08-24=12; 2026-08-31=9; 2026-09-07=3; 2026-09-14=7; 2026-09-21=9; 2026-09-28=9; 2026-10-05=14; 2026-10-12=6 | 8.625 | 0 | PASS |
| 2 | 2 | Latte | 17.375 | 8 | 2026-08-24=15; 2026-08-31=17; 2026-09-07=19; 2026-09-14=17; 2026-09-21=16; 2026-09-28=22; 2026-10-05=21; 2026-10-12=12 | 17.375 | 0 | PASS |
| 3 | 3 | Matcha Latte | 13 | 8 | 2026-08-24=16; 2026-08-31=11; 2026-09-07=9; 2026-09-14=8; 2026-09-21=16; 2026-09-28=16; 2026-10-05=21; 2026-10-12=7 | 13 | 0 | PASS |
| 4 | 4 | Cold Brew | 9.875 | 8 | 2026-08-24=9; 2026-08-31=14; 2026-09-07=6; 2026-09-14=3; 2026-09-21=8; 2026-09-28=10; 2026-10-05=12; 2026-10-12=17 | 9.875 | 0 | PASS |
| 5 | 5 | Bạc xỉu | 12.875 | 8 | 2026-08-24=14; 2026-08-31=18; 2026-09-07=7; 2026-09-14=2; 2026-09-21=12; 2026-09-28=17; 2026-10-05=17; 2026-10-12=16 | 12.875 | 0 | PASS |
| 6 | 6 | Trà đào | 8.75 | 8 | 2026-08-24=11; 2026-08-31=7; 2026-09-07=9; 2026-09-14=7; 2026-09-21=8; 2026-09-28=9; 2026-10-05=12; 2026-10-12=7 | 8.75 | 0 | PASS |
| 7 | 7 | Cappuccino | 9.125 | 8 | 2026-08-24=12; 2026-08-31=14; 2026-09-07=5; 2026-09-14=5; 2026-09-21=11; 2026-09-28=9; 2026-10-05=9; 2026-10-12=8 | 9.125 | 0 | PASS |
| 8 | 8 | Croissant | 9.375 | 8 | 2026-08-24=9; 2026-08-31=8; 2026-09-07=11; 2026-09-14=6; 2026-09-21=8; 2026-09-28=5; 2026-10-05=19; 2026-10-12=9 | 9.375 | 0 | PASS |

Branch demand: 1; số variant được đối chiếu: 8.
Không phân bổ product demand xuống variant trong live. Demo fixture map product_id sang variant_id vì recipes mock không có variant_id.

## 7. Kiểm chứng recipe và inventory

Công thức independent: forecast_usage = tổng expected_variant_quantity × recipe.quantity_required cùng unit. available_stock = quantity_in_stock - reserved_quantity. recommended_purchase = max(0, usage + reorder_level - available_stock). reorder_level chỉ được dùng như ngưỡng heuristic, không được gọi là safety stock/target stock.

| nguyên liệu | variant đóng góp | demand | recipe quantity | đơn vị | usage tính lại | usage pipeline | tồn khả dụng | đề xuất mua tính lại | trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | v1: 8.625×18.000; v2: 17.375×18.000; v4: 9.875×22.000; v5: 12.875×12.000; v7: 9.125×18.000 | 1=8.625; 2=17.375; 4=9.875; 5=12.875; 7=9.125 | 18; 18; 22; 12; 18 | g; g; g; g; g | 1004 | 1004 | 8200 | 0 | PASS |
| 2 | v2: 17.375×180.000; v3: 13.000×180.000; v5: 12.875×200.000; v7: 9.125×120.000 | 2=17.375; 3=13.000; 5=12.875; 7=9.125 | 180; 180; 200; 120 | ml; ml; ml; ml | 9137.5 | 9137.5 | 17500 | 0 | PASS |
| 3 | v3: 13.000×5.000 | 3=13.000 | 5 | g | 65 | 65 | 1150 | 0 | PASS |
| 4 | v6: 8.750×200.000 | 6=8.750 | 200 | ml | 1750 | 1750 | 8800 | 0 | PASS |
| 5 | v8: 9.375×1.000 | 8=9.375 | 1 | piece | 9.375 | 9.375 | 40 | 0 | PASS |

Không áp dụng conversion, hao hụt, lead time, inbound, MOQ hoặc pack size vì snapshot/schema adapter hiện không cung cấp các trường đó. Reservation chỉ được trừ một lần trong available_stock; forecast demand bắt đầu sau cutoff.

## 8. Rolling-origin backtest

Backtest dùng 3 fold thực hiện trên cùng snapshot; requested folds=3, horizon=7. Fold cuối là test độc lập; các fold trước là validation để chọn model.
Không shuffle. Mỗi fold fit candidate trên train trước cutoff và forecast recursive horizon ngày. Signed error = forecast - actual.

### Từng ngày: model được chọn và baseline

| fold | cutoff | horizon | target | actual | forecast model | seasonal naive | weekday mean | signed model | signed seasonal | signed weekday |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-09-07 | 1 | 2026-09-08 | 3908200 | 3992662.5 | 3848700 | 3992662.5 | 84462.5 | -59500 | 84462.5 |
| 1 | 2026-09-07 | 2 | 2026-09-09 | 4289000 | 4507700 | 3207600 | 4507700 | 218700 | -1081400 | 218700 |
| 1 | 2026-09-07 | 3 | 2026-09-10 | 4330300 | 4171887.5 | 3469100 | 4171887.5 | -158412.5 | -861200 | -158412.5 |
| 1 | 2026-09-07 | 4 | 2026-09-11 | 2723300 | 4369512.5 | 3910600 | 4369512.5 | 1646212.5 | 1187300 | 1646212.5 |
| 1 | 2026-09-07 | 5 | 2026-09-12 | 4875100 | 5208525 | 5480500 | 5208525 | 333425 | 605400 | 333425 |
| 1 | 2026-09-07 | 6 | 2026-09-13 | 4998900 | 5308912.5 | 5050800 | 5308912.5 | 310012.5 | 51900 | 310012.5 |
| 1 | 2026-09-07 | 7 | 2026-09-14 | 2131800 | 3755762.5 | 2806400 | 3755762.5 | 1623962.5 | 674600 | 1623962.5 |
| 2 | 2026-10-05 | 1 | 2026-10-06 | 3734500 | 3813950 | 4424500 | 3813950 | 79450 | 690000 | 79450 |
| 2 | 2026-10-05 | 2 | 2026-10-07 | 3631100 | 3875725 | 3499200 | 3875725 | 244625 | -131900 | 244625 |
| 2 | 2026-10-05 | 3 | 2026-10-08 | 3909100 | 3876462.5 | 3943100 | 3876462.5 | -32637.5 | 34000 | -32637.5 |
| 2 | 2026-10-05 | 4 | 2026-10-09 | 4336800 | 3949925 | 3886000 | 3949925 | -386875 | -450800 | -386875 |
| 2 | 2026-10-05 | 5 | 2026-10-10 | 4862800 | 4962387.5 | 3020200 | 4962387.5 | 99587.5 | -1842600 | 99587.5 |
| 2 | 2026-10-05 | 6 | 2026-10-11 | 4531400 | 4876837.5 | 4294800 | 4876837.5 | 345437.5 | -236600 | 345437.5 |
| 2 | 2026-10-05 | 7 | 2026-10-12 | 3126500 | 3624725 | 4655600 | 3624725 | 498225 | 1529100 | 498225 |
| 3 | 2026-10-11 | 1 | 2026-10-12 | 3126500 | 3624725 | 4655600 | 3624725 | 498225 | 1529100 | 498225 |
| 3 | 2026-10-11 | 2 | 2026-10-13 | 3857300 | 3854137.5 | 3734500 | 3854137.5 | -3162.5 | -122800 | -3162.5 |
| 3 | 2026-10-11 | 3 | 2026-10-14 | 4669800 | 3747225 | 3631100 | 3747225 | -922575 | -1038700 | -922575 |
| 3 | 2026-10-11 | 4 | 2026-10-15 | 2618800 | 3794325 | 3909100 | 3794325 | 1175525 | 1290300 | 1175525 |
| 3 | 2026-10-11 | 5 | 2026-10-16 | 3502100 | 3990850 | 4336800 | 3990850 | 488750 | 834700 | 488750 |
| 3 | 2026-10-11 | 6 | 2026-10-17 | 5040400 | 4945412.5 | 4862800 | 4945412.5 | -94987.5 | -177600 | -94987.5 |
| 3 | 2026-10-11 | 7 | 2026-10-18 | 4970200 | 4905412.5 | 4531400 | 4905412.5 | -64787.5 | -438800 | -64787.5 |

### Metrics từng fold

| fold | cutoff | test start | test end | phase | model | MAE | RMSE | WAPE % | mean signed error | weekday baseline MAE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-09-07 | 2026-09-08 | 2026-09-14 | validation | WeekdayMean8Weeks | 625026.786 | 897186.706 | 16.0518 | 579766.071 | 625026.786 |
| 2 | 2026-10-05 | 2026-10-06 | 2026-10-12 | validation | WeekdayMean8Weeks | 240976.786 | 291391.747 | 5.9961 | 121116.071 | 240976.786 |
| 3 | 2026-10-11 | 2026-10-12 | 2026-10-18 | test | WeekdayMean8Weeks | 464001.786 | 624881.522 | 11.6898 | 153855.357 | 464001.786 |

### Metrics tổng hợp

| Đối tượng | MAE | RMSE | WAPE % | Mean signed error |
| --- | --- | --- | --- | --- |
| WeekdayMean8Weeks | 443335.119 | 653281.474 | 11.1935 | 284912.5 |
| WeekdayMean8Weeks | 443335.119 | 653281.474 | 11.1935 | 284912.5 |

Test cuối: model=464001.786 MAE; SeasonalNaive=776000; WeekdayMean8Weeks=464001.786.
So sánh model tốt hơn cả hai baseline trên test: **NOT VERIFIED**. Không đặt ngưỡng nghiệp vụ và không gọi 100%-WAPE là accuracy.
Nếu model được chọn chính là WeekdayMean8Weeks, kết quả chỉ chứng minh baseline đang phù hợp hơn candidate tree trên snapshot; không phải model vượt baseline.

## 9. Hạn chế và phần chưa xác minh

- Demo dùng CSV tổng hợp; không chứng minh dữ liệu production hoặc hiệu quả thực tế.
- Demo fixture không có variant_id thật; mapping product_id → variant_id chỉ là giới hạn fixture.
- Live snapshot/backend endpoint phải cung cấp version, generated_at, complete_through, coverage_complete, timezone, branch và refund amount khi cần.
- HTTP POST /api/forecasting chưa được gọi trong proof; cần server/credentials để kiểm tra serialization end-to-end.
- Bảng AI_Forecasts chưa được ghi vì backend write contract chưa được triển khai.
- Chưa bịa confidence/prediction interval; forecast tương lai chưa có actual.
- WAPE dùng tổng absolute actual làm mẫu số; nếu bằng 0 phải ghi NOT VERIFIED, không dùng epsilon.

