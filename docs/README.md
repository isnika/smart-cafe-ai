# Tài Liệu Kiến Trúc & Thiết Kế Microservices – Hệ Thống Smart Café AI

> **Ngày lập:** 28/09/2026  
> **Phiên bản:** 1.0  
> **Kiến trúc:** Microservices (Database-per-Service, Transactional Outbox, API Gateway, SSE/WebSocket)  
> **Tổng quan hệ thống:** 10 Microservices | 10 Databases MySQL | 48 Bảng dữ liệu | 243 APIs RESTful

---

## 1. Cấu Trúc Thư Mục Tài Liệu (`/docs`)

Toàn bộ tài liệu thiết kế các dịch vụ (Services) được tổ chức chuẩn hóa trong thư mục `docs` theo cấu trúc chi tiết như sau:

```text
smart-cafe-ai/
└── docs/
    ├── README.md                           # Master Index, Tổng quan kiến trúc & Quy chuẩn hệ thống
    ├── templates/
    │   └── service-spec-template.md        # Khung mẫu 16 tiêu chí chuẩn hóa cho từng Service
    └── services/
        ├── 01-identity-service.md          # Chi tiết Identity Service (Port 8081)
        ├── 02-catalog-service.md           # Chi tiết Catalog Service (Port 8082)
        ├── 03-store-service.md             # Chi tiết Store Service (Port 8083)
        ├── 04-order-service.md             # Chi tiết Order Service (Port 8084)
        ├── 05-payment-service.md           # Chi tiết Payment Service (Port 8085)
        ├── 06-inventory-service.md         # Chi tiết Inventory Service (Port 8086)
        ├── inventory-service-business-flow.md # Hướng dẫn toàn diện luồng nghiệp vụ & lưu ý Inventory Service
        ├── 07-workforce-service.md         # Chi tiết Workforce Service (Port 8087)
        ├── 08-engagement-service.md        # Chi tiết Engagement Service (Port 8088)
        ├── 09-intelligence-service.md      # Chi tiết Intelligence Service (Port 8089)
        └── 10-platform-service.md          # Chi tiết Platform Service (Port 8090)
```

---

## 2. Danh Mục Các Microservices

| Service | Database | Port (Gợi ý) | Prefix Gateway | Số Bảng DB | Số API | Mô Tả Tóm Tắt |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| **01. Identity Service** | `smart_cafe_identity_db` | `8081` | `/auth`, `/users`, `/manager/staff`, `/admin/users`, `/admin/roles` | 4 | 38 | Quản lý tài khoản, xác thực (Mật khẩu, Google OAuth, OTP), phân quyền RBAC, hồ sơ cá nhân và địa chỉ giao hàng. |
| **02. Catalog Service** | `smart_cafe_catalog_db` | `8082` | `/catalog` | 5 | 24 | Danh mục sản phẩm, biến thể (size/giá), nhóm tùy chọn (đường/đá/topping). Nhận sự kiện tồn kho để bật/tắt trạng thái variant. |
| **03. Store Service** | `smart_cafe_store_db` | `8083` | `/branches`, `/tables`, `/qr`, `/table-sessions` | 3 | 21 | Chi nhánh, sơ đồ bàn, mã QR động và quản lý phiên bàn (`Table_Sessions`) phục vụ gọi món tại bàn. |
| **04. Order Service** | `smart_cafe_order_db` | `8084` | `/carts`, `/orders` | 8 (+1) | 28 | Quản lý giỏ hàng, đặt hàng (Online/QR/POS), vòng đời đơn hàng, lịch sử trạng thái, push notification SSE và phát sự kiện Outbox. |
| **05. Payment Service** | `smart_cafe_payment_db` | `8085` | `/payments`, `/refunds`, `/invoices`, `/cashier-shifts` | 5 | 28 | Thanh toán (Tiền mặt, VNPay, Momo), hoàn tiền, hóa đơn điện tử VAT, quản lý ca thu ngân. Phát sự kiện thanh toán qua Outbox. |
| **06. Inventory Service** | `smart_cafe_inventory_db` | `8086` | `/inventory` | 8 | 28 | Ngân hàng nguyên liệu, tồn kho từng chi nhánh, định lượng công thức & tính giá vốn cost, nhà cung cấp, nhập hàng PO và tự động trừ/hoàn nguyên liệu. |
| **07. Workforce Service** | `smart_cafe_workforce_db` | `8087` | `/workforce` | 4 (+1) | 26 | Khung ca làm việc, xếp lịch nhân viên, chấm công Check-in/Check-out, duyệt đơn nghỉ phép và duyệt yêu cầu đổi ca. |
| **08. Engagement Service** | `smart_cafe_engagement_db` | `8088` | `/loyalty`, `/reviews` | 4 | 9 | Tích tem (10 ly đổi 1 ly), đổi ly miễn phí, đánh giá & nhận xét sản phẩm từ khách hàng đã hoàn tất đơn hàng. |
| **09. Intelligence Service**| `smart_cafe_intelligence_db` | `8089` | `/chat`, `/ws/chat`, `/ai` | 5 | 20 | Chatbot AI hỗ trợ & kết nối nhân viên tư vấn, Knowledge Base (RAG FAQ/SOP), dự báo doanh thu/tồn kho AI và gợi ý món ăn. |
| **10. Platform Service** | `smart_cafe_platform_db` | `8090` | `/admin/configs`, `/admin/integrations`, `/admin/audit-logs`, `/admin/backups`, `/reports`, `/configs` | 2 (+2) | 21 | Cấu hình hệ thống, kiểm tra tích hợp bên thứ 3, nhật ký truy vết Audit Log, sao lưu/phục hồi DB và tổng hợp báo cáo (API Composition). |

---

## 3. Khung Tiêu Chí Chuẩn Hóa (16 Phần)

Mỗi file tài liệu chi tiết cho từng dịch vụ trong `/docs/services/` đều tuân thủ chính xác **16 mục cấu trúc** chuẩn hóa:

1. **Document Information**: Mã tài liệu, Tên Service, Ngày lập, Phiên bản, Database sở hữu, Prefix REST, Cổng mặc định.
2. **Service Overview**: Tổng quan vai trò, vị trí trong kiến trúc tổng thể.
3. **Responsibilities & Scope**: 
   - 3.1 Responsibilities (Trách nhiệm cốt lõi)
   - 3.2 In Scope (Chức năng thuộc phạm vi)
   - 3.3 Out of Scope (Chức năng không thuộc phạm vi / ủy quyền cho service khác)
4. **Actors**: Danh sách tác nhân tương tác (Customer, Staff, Manager, Admin, System/Internal, Third-party).
5. **Business Functions**: Nhóm chức năng nghiệp vụ chi tiết.
6. **Database Ownership**:
   - 6.1 Database (Tên DB, Character set, Collation)
   - 6.2 Owned Tables (Schema đầy đủ từng bảng: cột, kiểu dữ liệu, khóa chính, ràng buộc)
   - 6.3 External References (Tham chiếu mềm tới ID của service khác)
7. **Business Rules**: Các quy tắc nghiệp vụ, công thức tính toán, điều kiện ràng buộc.
8. **State / Status Flow**: Các enum trạng thái và sơ đồ / quy tắc chuyển đổi trạng thái (State Machine).
9. **API Specification**:
   - 9.1 API Summary (Bảng tổng hợp danh sách API)
   - 9.2 API Details (Chi tiết từng API: Method, Endpoint, Header, Request Body, Response 200/201/4xx/5xx)
10. **Event Specification**:
    - 10.1 Published Events (Sự kiện phát ra qua Outbox Pattern)
    - 10.2 Consumed Events (Sự kiện tiếp nhận từ các service khác)
11. **Dependencies & Service Integration**: Các tích hợp đồng bộ (REST internal) và bất đồng bộ (Message Broker).
12. **Error Handling**: Mã lỗi nghiệp vụ đặc thù, HTTP Status mapping và cấu trúc Error Response chuẩn.
13. **Security & Authorization**: Phân quyền RBAC, JWT Claims, Data Scoping theo `branch_id` / `user_id`.
14. **Sequence Flow**: Sơ đồ trình tự Sequence Diagram (Mermaid) minh họa luồng nghiệp vụ tiêu biểu.
15. **Non-functional Requirements**: NFR về hiệu năng, độ tin cậy (Idempotency), Rate Limiting, Audit Log.
16. **Open Issues / Decision Log**: Phân tích khoảng trống DB hiện tại (DB gaps), DDL đề xuất bổ sung và log quyết định kiến trúc.

---

## 4. Chuẩn Quy Ước Chung Toàn Hệ Thống

### 4.1 Base URL & Format Response

- **Base URL:** `https://{host}/api/v1`
- **JSON Naming Convention:** `snake_case` (trùng chính xác tên cột DB).
- **Trường tính toán:** Ký hiệu `◇` (ví dụ: `min_price◇`, `item_count◇`).
- **Trường ⚠:** Đánh dấu dữ liệu cần bổ sung / thay đổi DDL DB.

#### Single Object Response (HTTP 200/201)
```json
{
  "success": true,
  "data": { ... },
  "trace_id": "8f1a2b3c4d5e6f7a"
}
```

#### Paginated Array Response (HTTP 200)
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "size": 20,
    "total_items": 135,
    "total_pages": 7
  },
  "trace_id": "8f1a2b3c4d5e6f7a"
}
```

#### Error Response (HTTP 4xx/5xx)
```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Không tìm thấy thông tin đơn hàng yêu cầu",
    "details": [
      {
        "field": "order_id",
        "issue": "must be a positive integer"
      }
    ]
  },
  "trace_id": "8f1a2b3c4d5e6f7a"
}
```

---

## 5. Danh Sách Đường Dẫn Lập Tức

- 📄 [Khung Mẫu 16 Tiêu Chí](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/templates/service-spec-template.md)
- 📄 [01. Identity Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/01-identity-service.md)
- 📄 [02. Catalog Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/02-catalog-service.md)
- 📄 [03. Store Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/03-store-service.md)
- 📄 [04. Order Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/04-order-service.md)
- 📄 [05. Payment Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/05-payment-service.md)
- 📄 [06. Inventory Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/06-inventory-service.md)
- 📄 [07. Workforce Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/07-workforce-service.md)
- 📄 [08. Engagement Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/08-engagement-service.md)
- 📄 [09. Intelligence Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/09-intelligence-service.md)
- 📄 [10. Platform Service](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docs/services/10-platform-service.md)
