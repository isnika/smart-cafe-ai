# Operational Data API contract

AI service không truy cập trực tiếp database của Catalog/Order Service. Cách này
giữ ownership của microservice, buộc Order Service tự kiểm tra quyền người dùng và
không phá vỡ chatbot khi schema SQL thay đổi.

## Catalog search

`GET {DATA_API_BASE_URL}{DATA_API_CATALOG_PATH}`

Query parameters:

- `q`: câu hỏi đã contextualize.
- `intent`: các truy vấn sản phẩm như `PRODUCT_PRICE`, `PRODUCT_DETAIL`,
  `PRODUCT_INFO`, `MENU_QUERY`, `PRODUCT_RECOMMENDATION`, `PRODUCT_AVAILABILITY`,
  `PRODUCT_FILTER` hoặc `PRODUCT_COMPARISON`.
- `branch_id`: optional; bắt buộc nếu muốn khẳng định availability.

Backend phải chỉ trả `Products.status=Active`, `Product_Variants.status=Active` và
join `Branch_Product_Availability` theo quy tắc trong `db_smart_cafe.txt`.

```json
{
  "products": [
    {
      "id": 3,
      "name": "Matcha latte",
      "description": "Matcha với sữa",
      "temperature": "Hot_Or_Iced",
      "caffeine_level": "Medium",
      "flavor_tags": ["matcha", "milky"],
      "branch_name": "Smart Café Hiệp Phú",
      "updated_at": "2026-11-11T10:00:00+07:00",
      "variants": [
        {
          "id": 31,
          "variant_name": "M",
          "price": 55000,
          "is_available": true,
          "unavailable_reason": null
        }
      ]
    }
  ]
}
```

Không có `branch_id` thì `is_available` nên là `null`; chatbot chỉ nói sản
phẩm có trong menu. API timeout/lỗi không rơi về giá tĩnh cũ.

## Recommendation snapshot

Recommendation dùng cùng ownership của Backend, không kết nối trực tiếp vào
database của Catalog/Order/Engagement. Khi
`RECOMMENDATION_SOURCE_MODE=live`, AI service gọi:

`GET {DATA_API_BASE_URL}{RECOMMENDATION_SNAPSHOT_PATH}`

Query tùy chọn:

- `branch_id`: lọc sản phẩm theo chi nhánh. Đây là `Branches.id` của Store
  Service, không phải khóa ngoại SQL trong Catalog.

Response tối thiểu:

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

Backend phải tạo snapshot từ các trường thật trong schema:

- Catalog: `Products.status = 'Active'`, `Categories.status = 'Active'`,
  `Product_Variants.status = 'Active'`, giá lấy từ variant active. Nếu có
  `branch_id`, áp dụng đúng quy tắc `Branch_Product_Availability`: không có row
  là có thể bán; có row thì `is_available = TRUE`.
- Orders: chỉ dùng item thuộc `Orders.status = 'Completed'`. Loại
  `Cancelled`, `Rejected`, `Pending_Payment` và các trạng thái chưa hoàn tất.
  `payment_status = 'Refunded'` không đóng góp; đơn `Partially_Refunded` chỉ
  được trả vào snapshot nếu Backend đã tính được quantity hợp lệ sau hoàn.
- Rating: chỉ lấy `Product_Reviews.status = 'Approved'`, nối qua
  `Verified_Purchases`; nếu không có review thì trả `rating: null`. Không coi
  việc thiếu rating là không thích.
- Identity: `user_id` dùng `Users.id`; Backend không cần gửi email, tên hoặc
  thông tin cá nhân khác.
- Tùy chọn: schema có `Product_Options` và `Order_Item_Options`, nhưng snapshot
  chỉ nên thêm preference option khi Backend có phép tổng hợp đáng tin cậy.
  AI service hiện không suy diễn độ ngọt/đá/topping từ tên món.

Recommendation cá nhân hóa kiểm tra quyền qua:

`GET {DATA_API_BASE_URL}{RECOMMENDATION_VIEWER_PATH}`

Request phải forward `Authorization`. Response trả `{ "user_id": "..." }`
được suy ra từ token. Backend phải từ chối token không hợp lệ; AI service sẽ
không chấp nhận `user_id` trong request nếu khác user đã xác thực.

Khi snapshot/viewer API lỗi hoặc chưa cấu hình, live mode trả lỗi 503. AI service
không tự chuyển sang `data_mock`. CSV demo chỉ dùng khi bật tường minh
`RECOMMENDATION_SOURCE_MODE=demo`.

## Phân chia nguồn dữ liệu

- Backend/DB là source of truth cho tên, mô tả, giá biến thể, menu đang
  active và availability theo chi nhánh.
- Knowledge base file là source of truth cho chính sách ship, hoàn/hủy, Wi-Fi,
  giờ mở cửa và các quy định do chủ quán duyệt.
- Khi `DATA_API_BASE_URL` đã cấu hình, chatbot không fallback sang catalog
  sản phẩm tĩnh nếu Backend lỗi, tránh trả giá hoặc mô tả cũ.

## Order lookup

`GET {DATA_API_BASE_URL}{DATA_API_ORDER_PATH}` với `:order_code` hoặc
`{order_code}` là placeholder.

AI service forward `Authorization` của request gốc và thêm `X-API-Key` nếu có.
Order Service phải xác minh order thuộc user/token đó; không chỉ dựa vào mã
đơn.

```json
{
  "order_code": "SC-123456",
  "status": "Preparing",
  "payment_status": "Paid",
  "fulfillment_type": "Delivery",
  "branch_name": "Smart Café Hiệp Phú",
  "updated_at": "2026-11-11T10:05:00+07:00"
}
```

## Headers từ client/backend

- `Authorization`: token người dùng, chỉ dùng cho order lookup.
- `X-Branch-Id`: chi nhánh dùng cho availability.
- `X-Reindex-Key`: khóa quản trị, chỉ cho `POST /chat/reindex`.

Production nên đặt `DATA_API_BASE_URL`, `DATA_API_KEY`, CORS origins và
`CHAT_REINDEX_API_KEY` bằng secret manager; không commit giá trị thật.
