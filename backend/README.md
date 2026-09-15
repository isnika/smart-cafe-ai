# Smart AI Cafe - Backend

Spring Boot app dùng chung cho 2 bạn BE:
- **BE1**: module `ordermenu` (Order & Menu)
- **BE2**: module `paymentcustomer` (Payment & Customer)
- **shared**: dùng chung (User entity, config, security) — ai sửa phải báo người kia

## Yêu cầu môi trường

- Java 17
- Maven 3.9+
- PostgreSQL (chạy qua Docker hoặc cài local)

## Cách chạy

### 1. Cấu hình database

Cách 1 - dùng Docker (khuyên dùng), chạy ở thư mục gốc dự án (ngang hàng `backend/`):
```bash
docker-compose up -d database
```

Cách 2 - tự cài PostgreSQL, tạo database tên `smart_cafe_db`.

### 2. Cấu hình biến môi trường

Copy file `.env.example` (ở thư mục gốc dự án) thành `.env`, điền giá trị thật:
```
DB_USERNAME=admin
DB_PASSWORD=admin123
JWT_SECRET=your_secret_key
```

### 3. Chạy app

```bash
cd backend
mvn spring-boot:run
```

App chạy ở `http://localhost:8080`

## Cấu trúc thư mục

```
src/main/java/com/smartcafe/backend/
├── modules/
│   ├── ordermenu/          → BE1: Order, Menu
│   │   ├── controller/
│   │   ├── service/
│   │   ├── repository/
│   │   └── entity/
│   ├── paymentcustomer/    → BE2: Payment, Customer
│   │   ├── controller/
│   │   ├── service/
│   │   ├── repository/
│   │   └── entity/
│   └── shared/             → Dùng chung (auth, User entity, config)
└── BackendApplication.java
```

## Quy tắc làm việc chung

1. Mỗi module có prefix API riêng: `/api/order-menu/**` (BE1), `/api/payment-customer/**` (BE2)
2. KHÔNG tự ý sửa code trong module của người khác
3. Sửa file trong `shared/` → báo trước trong nhóm chat
4. Branch Git: `feature/be1-xxx`, `feature/be2-xxx`, merge vào `dev` thường xuyên (1-2 ngày/lần)
5. Không commit file `.env` (đã có trong `.gitignore`)
