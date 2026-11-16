# Calculation Proof - Recommendation

## 1. Kết luận

- Tính toán theo implementation: **PASS**.
- Thứ tự, tie-break và diversity: **PASS**.
- Không trùng sản phẩm: **PASS**.
- Sản phẩm thuộc serving set: **PASS**.
- Discovery filter: **NOT APPLICABLE**.
- HTTP API `POST /api/recommendation`: **NOT VERIFIED**; script gọi service trực tiếp, không giả mạo HTTP smoke test.
- Hiệu quả dự đoán sở thích: **NOT VERIFIED**; cần temporal evaluation.

PASS ở đây chỉ có nghĩa phép tính khớp code hiện tại, không có nghĩa model dự đoán sở thích chính xác.

## 2. Lệnh chạy và nguồn dữ liệu

- User: U001
- Strategy: personalized
- Product context: N/A
- Discovery: False
- Source mode: demo
- Source: C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\recommendation\data_mock
- Output: C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\recommendation\calculation proof.md
- Command: python "C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\recommendation\calculation proof.py" --source-mode demo --user-id U001 --top-k 5 --strategy personalized --output "C:\Users\pc\OneDrive\Máy tính\srcNK\smart-cafe-ai\ai-service\src\app\recommendation\calculation proof.md"

| Cấu hình | Giá trị |
| --- | --- |
| source_mode | demo |
| source_version | demo |
| snapshot_generated_at | N/A |
| reference_time | 2026-11-15 00:00:00 |
| model_version | hybrid-v2 |
| recency_half_life_days | 60 |
| trending_window_days | 30 |
| max_quantity_signal | 8 |
| max_order_signal | 20 |
| products used | 102 |
| interactions used | 16069 |
| users used | 492 |
| branch_id | N/A |

### Mapping schema → snapshot recommendation

- Catalog: `Products`, `Categories`, `Product_Variants`, và `Branch_Product_Availability` → product_id, name, category, description, price_vnd, thuộc tính content, is_active/is_available.
- User: `Users.id` → `interactions.user_id`; không tải email, tên hoặc thông tin cá nhân.
- Purchase: `Orders` + `Order_Items` → quantity, n_orders, last_purchase; snapshot operational phải chỉ lấy `Orders.status='Completed'`, xử lý payment/refund theo contract.
- Rating: `Product_Reviews` đã `Approved` và `Verified_Purchases` → rating; không có review thì rating là null.
- Options: schema có `Product_Options`/`Order_Item_Options`, nhưng snapshot hiện không cung cấp tín hiệu option nên proof không suy diễn độ ngọt/đá/topping.

Demo raw rows: products.csv=102, user_item_summary.csv=16069; normalized/used=102/16069. Không thấy chênh lệch số dòng ở lần chạy này.
Demo summary không chứa order status/refund nên không thể liệt kê record bị loại theo các trạng thái DB; phần này chỉ được xác minh khi backend operational trả snapshot có contract tương ứng.

## 3. Công thức thực tế và code reference

- Preference weight: RecommendationService._user_history.
- Content: RecommendationService._history_content_scores.
- Collaborative: RecommendationService._collaborative_scores, item-item CF.
- Popularity: RecommendationService._popular_scores.
- Hybrid weights: RecommendationService._personalized.
- Normalize: RecommendationService._normalize.
- Reranking: RecommendationService._diversify; tie-break (-score, product_id).

age_days = max(0, as_of - last_purchase)
recency = clip(0.5 ** (age_days / half_life), lower=0.05)
strength = log1p(min(quantity, quantity_cap)) + 0.7 × log1p(min(n_orders, order_cap))
rating_factor = 1.25 nếu rating >= 4; 0.55 nếu rating <= 2; ngược lại 1.0
preference_weight = (strength + 0.1) × recency × rating_factor

- history < 3: content=0.70, collaborative=0.00, popularity=0.30.
- 3 <= history < 8: content=0.55, collaborative=0.25, popularity=0.20.
- history >= 8: content=0.45, collaborative=0.45, popularity=0.10.
- Mỗi component normalize độc lập theo positive maximum.
- Không có normalize lần hai trên tổng hybrid.

## 4. Lịch sử và tín hiệu sở thích

User: U001; số history row hợp lệ: 41.

| product_id | món | quantity | quantity sau cap | n_orders | orders sau cap | last_purchase | age_days | recency | rating | rating_factor | weight tính lại | weight pipeline | sai lệch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | Bạc xỉu | 2 | 2 | 2 | 2 | 2025-12-11 15:43:00 | 338.345139 | 0.05 | 2 | 0.55 | 0.0541101245 | 0.0541101245 | 0 |
| 4 | Cà phê đen | 1 | 1 | 1 | 1 | 2026-01-11 18:25:00 | 307.232639 | 0.05 | NOT VERIFIED | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 5 | Cà phê đen đá | 3 | 3 | 3 | 3 | 2026-09-25 07:15:00 | 50.697917 | 0.556724208 | NOT VERIFIED | 1 | 1.3677045922 | 1.3677045922 | 0 |
| 7 | Cà phê muối | 1 | 1 | 1 | 1 | 2026-09-25 07:15:00 | 50.697917 | 0.556724208 | NOT VERIFIED | 1 | 0.7116885065 | 0.7116885065 | 0 |
| 12 | Cà phê hazelnut | 7 | 7 | 7 | 7 | 2026-09-13 09:17:00 | 62.613194 | 0.4851311624 | 4 | 1.25 | 2.2043454165 | 2.2043454165 | 0 |
| 13 | Cà phê mocha | 33 | 8 | 31 | 20 | 2026-09-01 08:58:00 | 74.626389 | 0.4222668365 | 3.67 | 1 | 1.8699623557 | 1.8699623557 | 0 |
| 14 | Americano | 3 | 3 | 3 | 3 | 2026-09-07 15:50:00 | 68.340278 | 0.4540727517 | NOT VERIFIED | 1 | 1.1155207171 | 1.1155207171 | 0 |
| 15 | Americano đá | 9 | 8 | 9 | 9 | 2026-09-12 14:28:00 | 63.397222 | 0.4807569536 | NOT VERIFIED | 1 | 1.8792953457 | 1.8792953457 | 0 |
| 16 | Espresso | 25 | 8 | 24 | 20 | 2026-09-25 08:53:00 | 50.629861 | 0.5571620814 | 4.75 | 1.25 | 3.0841639349 | 3.0841639349 | 0 |
| 18 | Cappuccino | 1 | 1 | 1 | 1 | 2026-02-15 20:56:00 | 272.127778 | 0.05 | NOT VERIFIED | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 19 | Latte | 13 | 8 | 13 | 13 | 2026-09-28 07:50:00 | 47.673611 | 0.5765189021 | 5 | 1.25 | 2.9867748689 | 2.9867748689 | 0 |
| 20 | Caramel macchiato | 2 | 2 | 2 | 2 | 2026-08-19 08:40:00 | 87.638889 | 0.3633298623 | NOT VERIFIED | 1 | 0.714902694 | 0.714902694 | 0 |
| 21 | Flat white | 5 | 5 | 5 | 5 | 2026-09-22 09:11:00 | 53.617361 | 0.5382608179 | NOT VERIFIED | 1 | 1.6933637412 | 1.6933637412 | 0 |
| 22 | Cold brew | 14 | 8 | 14 | 14 | 2026-07-24 08:13:00 | 113.657639 | 0.2690052098 | 3.67 | 1 | 1.127901108 | 1.127901108 | 0 |
| 23 | Cold brew sữa | 1 | 1 | 1 | 1 | 2026-05-09 17:07:00 | 189.286806 | 0.1122836605 | NOT VERIFIED | 1 | 0.1435378406 | 0.1435378406 | 0 |
| 24 | Cold brew cam | 1 | 1 | 1 | 1 | 2026-07-17 11:55:00 | 120.503472 | 0.2485501357 | NOT VERIFIED | 1 | 0.3177341175 | 0.3177341175 | 0 |
| 27 | Matcha latte đá | 1 | 1 | 1 | 1 | 2026-08-17 14:28:00 | 89.397222 | 0.3560239736 | NOT VERIFIED | 1 | 0.4551233203 | 0.4551233203 | 0 |
| 33 | Matcha vanilla | 1 | 1 | 1 | 1 | 2026-07-28 08:30:00 | 109.645833 | 0.2817660007 | NOT VERIFIED | 1 | 0.3601956253 | 0.3601956253 | 0 |
| 34 | Matcha đá xay | 1 | 1 | 1 | 1 | 2026-09-09 16:32:00 | 66.311111 | 0.4648428 | NOT VERIFIED | 1 | 0.5942318896 | 0.5942318896 | 0 |
| 36 | Trà đào | 1 | 1 | 1 | 1 | 2026-05-09 09:03:00 | 189.622917 | 0.1118485188 | NOT VERIFIED | 1 | 0.1429815771 | 0.1429815771 | 0 |
| 41 | Trà vải | 2 | 2 | 2 | 2 | 2026-07-17 11:55:00 | 120.503472 | 0.2485501357 | 2 | 0.55 | 0.2689815758 | 0.2689815758 | 0 |
| 42 | Trà dâu | 1 | 1 | 1 | 1 | 2026-06-20 18:36:00 | 147.225 | 0.1825356296 | NOT VERIFIED | 1 | 0.2333444599 | 0.2333444599 | 0 |
| 43 | Trà xoài | 1 | 1 | 1 | 1 | 2026-04-21 09:33:00 | 207.602083 | 0.0908710953 | NOT VERIFIED | 1 | 0.1161650834 | 0.1161650834 | 0 |
| 44 | Trà kiwi | 1 | 1 | 1 | 1 | 2026-03-05 07:33:00 | 254.685417 | 0.052747373 | NOT VERIFIED | 1 | 0.0674296152 | 0.0674296152 | 0 |
| 48 | Trà ô long đào | 1 | 1 | 1 | 1 | 2026-09-07 15:50:00 | 68.340278 | 0.4540727517 | NOT VERIFIED | 1 | 0.5804639961 | 0.5804639961 | 0 |
| 51 | Trà gừng mật ong | 1 | 1 | 1 | 1 | 2026-02-19 18:39:00 | 268.222917 | 0.05 | NOT VERIFIED | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 52 | Trà bạc hà | 1 | 1 | 1 | 1 | 2026-06-20 18:36:00 | 147.225 | 0.1825356296 | NOT VERIFIED | 1 | 0.2333444599 | 0.2333444599 | 0 |
| 58 | Chocolate vanilla | 4 | 4 | 3 | 3 | 2026-03-16 11:40:00 | 243.513889 | 0.0600136791 | 3 | 1 | 0.1608272956 | 0.1608272956 | 0 |
| 60 | Chocolate đá xay | 1 | 1 | 1 | 1 | 2026-02-18 15:06:00 | 269.370833 | 0.05 | 3 | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 68 | Sữa tươi caramel | 1 | 1 | 1 | 1 | 2026-05-04 16:46:00 | 194.301389 | 0.1059638093 | NOT VERIFIED | 1 | 0.1354588576 | 0.1354588576 | 0 |
| 73 | Sữa chua chanh dây | 1 | 1 | 1 | 1 | 2026-03-26 15:43:00 | 233.345139 | 0.0674945279 | NOT VERIFIED | 1 | 0.0862816438 | 0.0862816438 | 0 |
| 75 | Sinh tố bơ | 1 | 1 | 1 | 1 | 2026-07-17 11:55:00 | 120.503472 | 0.2485501357 | 3 | 1 | 0.3177341175 | 0.3177341175 | 0 |
| 79 | Sinh tố việt quất | 1 | 1 | 1 | 1 | 2026-02-15 20:56:00 | 272.127778 | 0.05 | NOT VERIFIED | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 81 | Sinh tố sapoche | 2 | 2 | 2 | 2 | 2026-07-11 17:55:00 | 126.253472 | 0.2325762141 | 3 | 1 | 0.4576264691 | 0.4576264691 | 0 |
| 84 | Nước ép dưa hấu | 1 | 1 | 1 | 1 | 2025-12-19 08:20:00 | 330.652778 | 0.05 | NOT VERIFIED | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 87 | Nước ép cà rốt | 3 | 3 | 3 | 3 | 2026-06-20 18:36:00 | 147.225 | 0.1825356296 | 3 | 1 | 0.4484353568 | 0.4484353568 | 0 |
| 90 | Nước ép táo cần tây | 1 | 1 | 1 | 1 | 2026-02-04 14:01:00 | 283.415972 | 0.05 | NOT VERIFIED | 1 | 0.0639175103 | 0.0639175103 | 0 |
| 98 | Nước suối | 14 | 8 | 14 | 14 | 2026-09-23 09:06:00 | 52.620833 | 0.5444932658 | 3.67 | 1 | 2.2829838809 | 2.2829838809 | 0 |
| 100 | Cookies chocolate | 18 | 8 | 18 | 18 | 2026-09-28 07:50:00 | 47.673611 | 0.5765189021 | 4 | 1.25 | 3.1408258756 | 3.1408258756 | 0 |
| 101 | Croissant bơ | 25 | 8 | 25 | 20 | 2026-09-25 07:15:00 | 50.697917 | 0.556724208 | 4.75 | 1.25 | 3.0817400916 | 3.0817400916 | 0 |
| 102 | Bánh chuối | 4 | 4 | 4 | 4 | 2026-07-17 11:55:00 | 120.503472 | 0.2485501357 | 3 | 1 | 0.7048992333 | 0.7048992333 | 0 |

Sản phẩm không active/available không nằm trong serving set. Discovery chỉ loại món đã mua khi --discovery được bật.

## 5. Bảng điểm top K

| product_id | tên món | content | collaborative item-item | popularity | trọng số | điểm tính lại | điểm pipeline serialize | điểm API HTTP | sai lệch | trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | Cà phê caramel | 5.36915841 | 8.63965422 | 583 | (0.45, 0.45, 0.1) | 0.702655224284 | 0.7027 | NOT VERIFIED | -0.000044775716 | PASS |
| 6 | Cà phê sữa đá | 5.85402131 | 5.43162064 | 1754 | (0.45, 0.45, 0.1) | 0.660868560271 | 0.6609 | NOT VERIFIED | -0.000031439729 | PASS |
| 99 | Nước khoáng có gas | 1.08171201 | 13.98952612 | 832 | (0.45, 0.45, 0.1) | 0.550299025891 | 0.5503 | NOT VERIFIED | -0.000000974109 | PASS |
| 54 | Chocolate đá | 2.35574622 | 4.67147357 | 821 | (0.45, 0.45, 0.1) | 0.348274552597 | 0.3483 | NOT VERIFIED | -0.000025447403 | PASS |
| 57 | Chocolate hazelnut | 1.70957196 | 6.25918382 | 391 | (0.45, 0.45, 0.1) | 0.340812412224 | 0.3408 | NOT VERIFIED | 0.000012412224 | PASS |

Điểm HTTP API là NOT VERIFIED vì lần chạy này không gọi server HTTP. Điểm pipeline serialize là score sau round 4 chữ số.

## 6. Phép thay số và đóng góp

Content raw = sum(similarity × preference_weight) over history.
Collaborative raw = item-item cosine similarity × preference_weight; purchased items are excluded and top 100 are retained.
Each component is normalized independently by its positive maximum.
Hybrid score = weighted sum of normalized components.
Popularity dùng cửa sổ 30 ngày trước as_of=2026-11-15 00:00:00; all-time fallback=True.
Không có bước normalize lần hai trên tổng hybrid.

### Product 10 - Cà phê caramel

- Category: Coffee
- Rank trước diversity: 1
- Rank sau diversity: 1
- reason_code: history_and_similar_users
- recommendation_type: Hybrid-Personalized
- reason serialize từ pipeline: Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự.
- reason có tín hiệu hỗ trợ: có

| Thành phần | Raw | Normalized | Trọng số | Đóng góp |
| --- | --- | --- | --- | --- |
| content | 5.36915841 | 0.91717439 | 0.45 | 0.412728474612 |
| collaborative item-item | 8.63965422 | 0.61758019 | 0.45 | 0.277911086028 |
| popularity | 583 | 0.12015664 | 0.1 | 0.012015663644 |
| history reorder override | N/A | 0 | 0.70 / 0.30 | chỉ áp dụng khi có history nhưng không có content/CF |

Công thức score tính lại:
score = weight_content × content_normalized + weight_collaborative × collaborative_normalized + weight_popularity × popularity_normalized
score tính lại = 0.702655224284
score pipeline sau round(4) = 0.7027

Đóng góp content chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 12 | Cà phê hazelnut | 0.4881268132 | 2.2043454165 | 1.0760001033 |
| 13 | Cà phê mocha | 0.5418798206 | 1.8699623557 | 1.0132948658 |
| 16 | Espresso | 0.281826065 | 3.0841639349 | 0.8691977856 |
| 5 | Cà phê đen đá | 0.3362106423 | 1.3677045922 | 0.4598368394 |
| 19 | Latte | 0.1413618792 | 2.9867748689 | 0.4222161081 |
| 7 | Cà phê muối | 0.4316447342 | 0.7116885065 | 0.3071965962 |
| 22 | Cold brew | 0.2375974771 | 1.127901108 | 0.2679864577 |
| 20 | Caramel macchiato | 0.3010965563 | 0.714902694 | 0.2152547393 |
| 15 | Americano đá | 0.0984989923 | 1.8792953457 | 0.1851086979 |
| 21 | Flat white | 0.1046057028 | 1.6933637412 | 0.1771355042 |

Đóng góp collaborative item-item chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 101 | Croissant bơ | 0.4831391336 | 3.0817400916 | 1.4889092378 |
| 100 | Cookies chocolate | 0.4384231359 | 3.1408258756 | 1.3770107297 |
| 12 | Cà phê hazelnut | 0.426654559 | 2.2043454165 | 0.9404940216 |
| 98 | Nước suối | 0.3959564865 | 2.2829838809 | 0.9039622762 |
| 21 | Flat white | 0.3149398509 | 1.6933637412 | 0.5333077241 |
| 19 | Latte | 0.1549913616 | 2.9867748689 | 0.4629243037 |
| 15 | Americano đá | 0.1848021779 | 1.8792953457 | 0.3472978729 |
| 13 | Cà phê mocha | 0.1773710352 | 1.8699623557 | 0.3316771588 |
| 16 | Espresso | 0.1065002885 | 3.0841639349 | 0.3284643488 |
| 5 | Cà phê đen đá | 0.236040437 | 1.3677045922 | 0.3228335896 |

### Product 6 - Cà phê sữa đá

- Category: Coffee
- Rank trước diversity: 2
- Rank sau diversity: 2
- reason_code: history_and_similar_users
- recommendation_type: Hybrid-Personalized
- reason serialize từ pipeline: Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự.
- reason có tín hiệu hỗ trợ: có

| Thành phần | Raw | Normalized | Trọng số | Đóng góp |
| --- | --- | --- | --- | --- |
| content | 5.85402131 | 1 | 0.45 | 0.45 |
| collaborative item-item | 5.43162064 | 0.38826338 | 0.45 | 0.174718519051 |
| popularity | 1754 | 0.36150041 | 0.1 | 0.03615004122 |
| history reorder override | N/A | 0 | 0.70 / 0.30 | chỉ áp dụng khi có history nhưng không có content/CF |

Công thức score tính lại:
score = weight_content × content_normalized + weight_collaborative × collaborative_normalized + weight_popularity × popularity_normalized
score tính lại = 0.660868560271
score pipeline sau round(4) = 0.6609

Đóng góp content chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 15 | Americano đá | 0.4411124511 | 1.8792953457 | 0.8289805762 |
| 5 | Cà phê đen đá | 0.5936343084 | 1.3677045922 | 0.8119163697 |
| 16 | Espresso | 0.2508290379 | 3.0841639349 | 0.7735978726 |
| 12 | Cà phê hazelnut | 0.3363197334 | 2.2043454165 | 0.7413648628 |
| 13 | Cà phê mocha | 0.3684645428 | 1.8699623557 | 0.6890148244 |
| 19 | Latte | 0.1841255544 | 2.9867748689 | 0.5499415785 |
| 21 | Flat white | 0.1924460458 | 1.6933637412 | 0.3258811561 |
| 22 | Cold brew | 0.2442532229 | 1.127901108 | 0.2754934807 |
| 7 | Cà phê muối | 0.3604713603 | 0.7116885065 | 0.256543324 |
| 14 | Americano | 0.1139620645 | 1.1155207171 | 0.1271270439 |

Đóng góp collaborative item-item chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 101 | Croissant bơ | 0.4929261197 | 3.0817400916 | 1.5190701853 |
| 100 | Cookies chocolate | 0.2654040398 | 3.1408258756 | 0.8335878757 |
| 98 | Nước suối | 0.2840445028 | 2.2829838809 | 0.6484690214 |
| 5 | Cà phê đen đá | 0.324943565 | 1.3677045922 | 0.4444268061 |
| 102 | Bánh chuối | 0.4129733303 | 0.7048992333 | 0.2911045839 |
| 12 | Cà phê hazelnut | 0.128124653 | 2.2043454165 | 0.2824309915 |
| 7 | Cà phê muối | 0.3228791034 | 0.7116885065 | 0.2297893469 |
| 21 | Flat white | 0.091801186 | 1.6933637412 | 0.1554527997 |
| 16 | Espresso | 0.0476750329 | 3.0841639349 | 0.147037617 |
| 15 | Americano đá | 0.064869703 | 1.8792953457 | 0.121909331 |

### Product 99 - Nước khoáng có gas

- Category: Other
- Rank trước diversity: 6
- Rank sau diversity: 3
- reason_code: history_and_similar_users
- recommendation_type: Hybrid-Personalized
- reason serialize từ pipeline: Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự.
- reason có tín hiệu hỗ trợ: có

| Thành phần | Raw | Normalized | Trọng số | Đóng góp |
| --- | --- | --- | --- | --- |
| content | 1.08171201 | 0.18478102 | 0.45 | 0.083151457878 |
| collaborative item-item | 13.98952612 | 1 | 0.45 | 0.45 |
| popularity | 832 | 0.17147568 | 0.1 | 0.017147568013 |
| history reorder override | N/A | 0 | 0.70 / 0.30 | chỉ áp dụng khi có history nhưng không có content/CF |

Công thức score tính lại:
score = weight_content × content_normalized + weight_collaborative × collaborative_normalized + weight_popularity × popularity_normalized
score tính lại = 0.550299025891
score pipeline sau round(4) = 0.5503

Đóng góp content chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 98 | Nước suối | 0.2852129064 | 2.2829838809 | 0.651136468 |
| 100 | Cookies chocolate | 0.0536184389 | 3.1408258756 | 0.1684061805 |
| 101 | Croissant bơ | 0.0486517542 | 3.0817400916 | 0.1499320613 |
| 14 | Americano | 0.0313996724 | 1.1155207171 | 0.0350269851 |
| 102 | Bánh chuối | 0.0476204489 | 0.7048992333 | 0.0335676179 |
| 87 | Nước ép cà rốt | 0.0509118462 | 0.4484353568 | 0.0228306719 |
| 24 | Cold brew cam | 0.025875081 | 0.3177341175 | 0.008221396 |
| 84 | Nước ép dưa hấu | 0.0469871621 | 0.0639175103 | 0.0030033024 |
| 90 | Nước ép táo cần tây | 0.0459464585 | 0.0639175103 | 0.0029367832 |
| 81 | Sinh tố sapoche | 0.0043349924 | 0.4576264691 | 0.0019838073 |

Đóng góp collaborative item-item chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 100 | Cookies chocolate | 0.8084450952 | 3.1408258756 | 2.5391852741 |
| 101 | Croissant bơ | 0.7930843413 | 3.0817400916 | 2.4440798106 |
| 98 | Nước suối | 0.7549213376 | 2.2829838809 | 1.723473245 |
| 16 | Espresso | 0.2696574443 | 3.0841639349 | 0.8316677645 |
| 12 | Cà phê hazelnut | 0.3424542103 | 2.2043454165 | 0.7548873689 |
| 19 | Latte | 0.2162750719 | 2.9867748689 | 0.6459649496 |
| 102 | Bánh chuối | 0.796568454 | 0.7048992333 | 0.5615004925 |
| 15 | Americano đá | 0.2795988304 | 1.8792953457 | 0.5254487806 |
| 13 | Cà phê mocha | 0.2603020696 | 1.8699623557 | 0.4867550714 |
| 5 | Cà phê đen đá | 0.3547604167 | 1.3677045922 | 0.4852074511 |

### Product 54 - Chocolate đá

- Category: Chocolate
- Rank trước diversity: 15
- Rank sau diversity: 4
- reason_code: history_and_similar_users
- recommendation_type: Hybrid-Personalized
- reason serialize từ pipeline: Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự.
- reason có tín hiệu hỗ trợ: có

| Thành phần | Raw | Normalized | Trọng số | Đóng góp |
| --- | --- | --- | --- | --- |
| content | 2.35574622 | 0.40241504 | 0.45 | 0.181086767942 |
| collaborative item-item | 4.67147357 | 0.33392651 | 0.45 | 0.150266927277 |
| popularity | 821 | 0.16920857 | 0.1 | 0.016920857378 |
| history reorder override | N/A | 0 | 0.70 / 0.30 | chỉ áp dụng khi có history nhưng không có content/CF |

Công thức score tính lại:
score = weight_content × content_normalized + weight_collaborative × collaborative_normalized + weight_popularity × popularity_normalized
score tính lại = 0.348274552597
score pipeline sau round(4) = 0.3483

Đóng góp content chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 100 | Cookies chocolate | 0.1979970048 | 3.1408258756 | 0.6218741159 |
| 15 | Americano đá | 0.2968225332 | 1.8792953457 | 0.5578172052 |
| 5 | Cà phê đen đá | 0.24723713 | 1.3677045922 | 0.3381473581 |
| 13 | Cà phê mocha | 0.1174768779 | 1.8699623557 | 0.2196773393 |
| 27 | Matcha latte đá | 0.2366996651 | 0.4551233203 | 0.1077275375 |
| 58 | Chocolate vanilla | 0.5037881857 | 0.1608272956 | 0.0810228915 |
| 21 | Flat white | 0.0397160995 | 1.6933637412 | 0.0672538028 |
| 34 | Matcha đá xay | 0.1066627133 | 0.5942318896 | 0.0633823857 |
| 19 | Latte | 0.0157991853 | 2.9867748689 | 0.0471886095 |
| 60 | Chocolate đá xay | 0.556719226 | 0.0639175103 | 0.0355841069 |

Đóng góp collaborative item-item chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 100 | Cookies chocolate | 0.3616305311 | 3.1408258756 | 1.1358185293 |
| 101 | Croissant bơ | 0.2681652064 | 3.0817400916 | 0.8264154678 |
| 98 | Nước suối | 0.265160143 | 2.2829838809 | 0.6053563322 |
| 16 | Espresso | 0.118782067 | 3.0841639349 | 0.3663433672 |
| 12 | Cà phê hazelnut | 0.1095224357 | 2.2043454165 | 0.2414252791 |
| 102 | Bánh chuối | 0.2450886268 | 0.7048992333 | 0.1727627851 |
| 87 | Nước ép cà rốt | 0.3442672409 | 0.4484353568 | 0.154381603 |
| 13 | Cà phê mocha | 0.0777110131 | 1.8699623557 | 0.1453166692 |
| 14 | Americano | 0.1257360012 | 1.1155207171 | 0.1402611142 |
| 19 | Latte | 0.0343550015 | 2.9867748689 | 0.1026106551 |

### Product 57 - Chocolate hazelnut

- Category: Chocolate
- Rank trước diversity: 18
- Rank sau diversity: 5
- reason_code: history_and_similar_users
- recommendation_type: Hybrid-Personalized
- reason serialize từ pipeline: Dựa trên lịch sử mua của bạn và xu hướng của khách có lịch sử tương tự.
- reason có tín hiệu hỗ trợ: có

| Thành phần | Raw | Normalized | Trọng số | Đóng góp |
| --- | --- | --- | --- | --- |
| content | 1.70957196 | 0.29203378 | 0.45 | 0.131415200038 |
| collaborative item-item | 6.25918382 | 0.44741929 | 0.45 | 0.201338679622 |
| popularity | 391 | 0.08058533 | 0.1 | 0.008058532564 |
| history reorder override | N/A | 0 | 0.70 / 0.30 | chỉ áp dụng khi có history nhưng không có content/CF |

Công thức score tính lại:
score = weight_content × content_normalized + weight_collaborative × collaborative_normalized + weight_popularity × popularity_normalized
score tính lại = 0.340812412224
score pipeline sau round(4) = 0.3408

Đóng góp content chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 12 | Cà phê hazelnut | 0.3077184209 | 2.2043454165 | 0.6783176907 |
| 100 | Cookies chocolate | 0.1948403008 | 3.1408258756 | 0.6119594585 |
| 13 | Cà phê mocha | 0.1032156353 | 1.8699623557 | 0.1930093526 |
| 58 | Chocolate vanilla | 0.4957561947 | 0.1608272956 | 0.0797311281 |
| 60 | Chocolate đá xay | 0.4039620472 | 0.0639175103 | 0.0258202483 |
| 101 | Croissant bơ | 0.0057526242 | 3.0817400916 | 0.0177280925 |
| 98 | Nước suối | 0.0057697773 | 2.2829838809 | 0.0131723085 |
| 20 | Caramel macchiato | 0.0128257511 | 0.714902694 | 0.009169164 |
| 22 | Cold brew | 0.008006627 | 1.127901108 | 0.0090306835 |
| 15 | Americano đá | 0.0044332814 | 1.8792953457 | 0.0083314452 |

Đóng góp collaborative item-item chính:
| source product_id | món nguồn | similarity | weight | contribution |
| --- | --- | --- | --- | --- |
| 100 | Cookies chocolate | 0.4372949405 | 3.1408258756 | 1.3734672645 |
| 101 | Croissant bơ | 0.3814205628 | 3.0817400916 | 1.1754390401 |
| 98 | Nước suối | 0.308013462 | 2.2829838809 | 0.7031897688 |
| 12 | Cà phê hazelnut | 0.1791547467 | 2.2043454165 | 0.3949189448 |
| 22 | Cold brew | 0.2646152424 | 1.127901108 | 0.2984598251 |
| 102 | Bánh chuối | 0.3559261145 | 0.7048992333 | 0.2508920452 |
| 13 | Cà phê mocha | 0.1308919739 | 1.8699623557 | 0.2447630639 |
| 19 | Latte | 0.0737211371 | 2.9867748689 | 0.2201884396 |
| 16 | Espresso | 0.0661993825 | 3.0841639349 | 0.2041697479 |
| 21 | Flat white | 0.1064308945 | 1.6933637412 | 0.1802262177 |

## 7. Đối chiếu độc lập

| Hạng mục | Kết quả | Tolerance / ghi chú |
| --- | --- | --- |
| Preference weight | PASS | 1e-10 |
| Content/COLLAB/pop maps | PASS | exact map equality trên cùng snapshot |
| Final score | PASS | \|delta\| <= 5.1e-05 |
| Tie-break/reranking | PASS | (-score, product_id), diversity category tối đa 2 |
| HTTP API POST /api/recommendation | NOT VERIFIED | Chưa gọi HTTP server |
| Branch filtering | NOT APPLICABLE | backend snapshot chịu trách nhiệm |

## 8. Phân tích product 99

Product 99 tồn tại: Nước khoáng có gas (Other).
- Rank trước diversity: 6.
- Rank sau diversity: 3.
- reason_code: history_and_similar_users.
- Content raw/normalized: 1.08171201 / 0.18478102.
- Collaborative raw/normalized: 13.98952612 / 1.
- Popularity raw/normalized: 832 / 0.17147568.
- Score tính lại: 0.550299025891.
Kết luận: product 99 được giải thích bằng các thành phần số liệu trên; proof không tự coi khác danh mục là lỗi.

## 9. Hạn chế

- Proof xác nhận phép tính theo code, không xác nhận hiệu quả dự đoán.
- Live lỗi không tự chuyển demo; demo phải được chọn tường minh.
- HTTP API `POST /api/recommendation` chưa được gọi trong lần chạy này.
- Ratings/options/refunds được đối chiếu theo contract/schema; demo không có raw state đầy đủ.

## 10. Kết quả pipeline

- Requested strategy: personalized
- Actual strategy: personalized
- Fallback reason: null
- Pipeline IDs: [10, 6, 99, 54, 57]
- Independent IDs: [10, 6, 99, 54, 57]

