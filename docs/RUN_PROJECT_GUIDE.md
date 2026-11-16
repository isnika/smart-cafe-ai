# Hướng Dẫn Kéo (Pull) & Chạy Dự Án Smart Café AI

Tài liệu này hướng dẫn chi tiết cách tải về, cấu hình và khởi chạy toàn bộ hệ thống backend **Smart Café AI** cho thành viên trong nhóm, giảng viên hoặc người dùng mới.

---

## 1. Yêu Cầu Môi Trường

Hệ thống được đóng gói hoàn chỉnh bằng **Docker & Docker Compose**, do đó bạn **KHÔNG CẦN** cài đặt thủ công Java, Maven hay MySQL trên máy.

* **Docker Desktop** (bản mới nhất, hỗ trợ Docker Compose v2+).
* **Git** (để clone mã nguồn).
* **Cấu hình máy đề nghị:** Tối thiểu 8GB RAM (khuyến nghị 16GB) và 10GB dung lượng ổ cứng trống.

---

## 2. Cách Chạy Dự Án Nhanh Nhất (Khuyên Dùng)

### Bước 1: Clone Repository & Chuyển sang branch `backend`
Mở Terminal / PowerShell và chạy:
```bash
git clone https://github.com/isnika/smart-cafe-ai.git
cd smart-cafe-ai
git checkout backend
```

### Bước 2: Tạo file cấu hình môi trường `.env`
Sao chép từ file mẫu `.env.example`:
* **Trên Windows PowerShell:**
  ```powershell
  Copy-Item .env.example .env
  ```
* **Trên Linux / macOS / Git Bash:**
  ```bash
  cp .env.example .env
  ```
*(Các tham số mặc định trong file `.env` đã được cấu hình sẵn để chạy cục bộ ổn định).*

### Bước 3: Khởi chạy toàn bộ hệ thống bằng Docker Compose
Chạy 1 câu lệnh duy nhất:
```bash
docker compose up -d
```

> **Hệ thống sẽ tự động thực hiện:**
> 1. Khởi động **MySQL 8.0** và tự động nạp toàn bộ cấu trúc bảng cùng **50 sản phẩm F&B, topping, các chi nhánh, bàn ăn và tài khoản mẫu**.
> 2. Khởi động **RabbitMQ 3.13** làm Message Broker.
> 3. Khởi động **Eureka Server (Discovery)** và **API Gateway**.
> 4. Build và khởi động lần lượt **8 Business Microservices** theo đúng thứ tự phụ thuộc.

---

## 3. Cách Chạy Siêu Tốc Bằng Docker Hub (Không Cần Build Code)

Nếu bạn không cần chỉnh sửa mã nguồn Java mà chỉ muốn chạy thử nghiệm hệ thống hoặc tích hợp Frontend, hãy sử dụng file compose lấy trực tiếp image từ Docker Hub:

```bash
docker compose -f docker-compose.hub.yml up -d
```
Docker sẽ tự động tải các images đã đóng gói sẵn của nhóm và khởi động hệ thống trong vòng 1-2 phút!

---

## 4. Danh Sách Cổng Truy Cập (Ports & Services)

Sau khi hệ thống khởi động thành công, các dịch vụ sẵn sàng tại các địa chỉ sau:

| Tên Dịch Vụ | Cổng (Port) | Đường Dẫn Truy Cập / Ghi Chú |
|---|:---:|---|
| **Swagger UI (Tập trung)** | `8080` | `http://localhost:8080/swagger-ui.html` (Xem & test API toàn bộ microservices) |
| **API Gateway** | `8080` | `http://localhost:8080` (Điểm vào duy nhất cho Client/Frontend) |
| **Eureka Server** | `8761` | `http://localhost:8761` (Dashboard quản lý trạng thái các microservice) |
| **RabbitMQ Management** | `15672` | `http://localhost:15672` (User: `smartcafe` / Pass: `smartcafe-local`) |
| **MySQL Server** | `3307` | `localhost:3307` (User: `root` / Pass: `root`) |
| **Identity Service** | `8081` | Quản lý tài khoản, đăng nhập, phân quyền |
| **Catalog Service** | `8082` | Menu 50 món, topping, danh mục F&B |
| **Store Service** | `8083` | Quản lý chi nhánh, bàn ăn, nhân sự |
| **Order Service** | `8084` | Giỏ hàng, đơn hàng, trạng thái chế biến |
| **Payment Service** | `8085` | Tích hợp cổng VNPay & MoMo |
| **Inventory Service** | `8086` | Quản lý nguyên vật liệu, kho |
| **Engagement Service** | `8087` | Tích điểm Loyalty, Voucher khuyến mãi |
| **Intelligence Service** | `8088` | AI gợi ý món ăn, dự báo doanh thu |

---

## 5. Danh Sách Tài Khoản Dùng Thử (Test Accounts)

Tất cả các tài khoản dưới đây đã được nạp sẵn vào Database và có mật khẩu mặc định là: **`123456`**.

| Họ và Tên | Email Đăng Nhập | Số Điện Thoại | Vai Trò (Role) | Chức Năng |
|---|---|---|---|---|
| **Nguyễn Quản Trị** | `admin@smartcafe.vn` | `0901000001` | `ROLE_ADMIN` | Quản trị viên toàn hệ thống |
| **Trần Quản Lý Q1** | `manager.q1@smartcafe.vn` | `0901000002` | `ROLE_MANAGER` | Quản lý chi nhánh Landmark/Nguyễn Huệ |
| **Lê Thu Ngân** | `cashier.q1@smartcafe.vn` | `0901000003` | `ROLE_CASHIER` | Thu ngân quầy POS |
| **Phạm Pha Chế** | `barista.q1@smartcafe.vn` | `0901000004` | `ROLE_BARISTA` | Nhân viên Barista màn hình KDS |
| **Võ Phục Vụ** | `staff_001@smartcafe.vn` | `0901000005` | `ROLE_STAFF` | Nhân viên phục vụ bàn |
| **Nguyễn Văn An** | `nguyenvanan@gmail.com` | `0988111222` | `ROLE_CUSTOMER` | Khách hàng VIP (15 tem đổi ly) |
| **Trần Thị Bình** | `tranthibinh@gmail.com` | `0988333444` | `ROLE_CUSTOMER` | Khách hàng mới (Có sẵn Voucher giảm giá) |

---

## 6. Các Lệnh Thao Tác Hữu Ích

* **Kiểm tra trạng thái các container đang chạy:**
  ```bash
  docker compose ps
  ```
* **Xem nhật ký (logs) theo thời gian thực:**
  ```bash
  docker compose logs -f
  # Hoặc xem riêng 1 service:
  docker compose logs -f catalog-service
  ```
* **Khởi động lại một service cụ thể (ví dụ payment-service):**
  ```bash
  docker compose restart payment-service
  ```
* **Dừng toàn bộ hệ thống:**
  ```bash
  docker compose down
  ```
* **Dừng và xóa sạch volumes dữ liệu (nếu muốn làm mới từ đầu):**
  ```bash
  docker compose down -v
  ```
