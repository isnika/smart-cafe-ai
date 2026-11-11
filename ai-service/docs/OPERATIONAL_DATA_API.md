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
