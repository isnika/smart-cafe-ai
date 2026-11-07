# Hướng Dẫn Build & Vận Hành Docker Toàn Diện (Smart Café AI)

Tài liệu hướng dẫn chi tiết cách build Docker tối ưu nhất cho toàn bộ hệ thống Microservices, hạ tầng Database (MySQL), Message Broker (RabbitMQ), Service Discovery (Eureka), và API Gateway.

---

## 1. Kiến Trúc & Chiến Lược Tối Ưu Hóa Docker

Hệ thống bao gồm **10 Spring Boot Microservices**, **MySQL 8.0**, và **RabbitMQ 3.13**. Để build và chạy mượt mà trên môi trường máy cá nhân hoặc Cloud Server:

### 1.1 Tối ưu hóa kích thước Image (Base Image siêu nhẹ)
- **Base Image:** `eclipse-temurin:17-jre-alpine` (chỉ chứa JRE tối giản trên nền tAlpine Linux, dung lượng mỗi image chỉ ~**140MB**, thay vì > **550MB** nếu dùng JDK thông thường).
- **Security:** Chạy dưới quyền user phi đặc quyền (`spring:spring`), tuân thủ chuẩn bảo mật container production.

### 1.2 Tối ưu hóa Tốc độ Build (Spring Boot Layered JAR)
Áp dụng cơ chế **Layertools** trích xuất 4 tầng độc lập của Spring Boot JAR:
1. `dependencies/` (Thư viện bên thứ ba - rất ít khi thay đổi $\rightarrow$ Docker Cache tái sử dụng 100%).
2. `spring-boot-loader/` (Trình nạp khởi động $\rightarrow$ Tái sử dụng cache).
3. `snapshot-dependencies/` (Thư viện nội bộ).
4. `application/` (Chỉ chứa code nghiệp vụ `.class` $\rightarrow$ Chỉ vài trăm KB!).

> Khi sửa code ở một service, thời gian build lại Docker Image chỉ mất **1 - 2 giây** vì Docker không cần tải lại bất kỳ dependency nào!

### 1.3 Tối ưu hóa RAM / Bộ nhớ JVM (Tránh nghẽn tài nguyên)
Nếu 10 microservices chạy mặc định với JVM Heap tự do, hệ thống sẽ ngốn từ 8GB - 12GB RAM. Trong [`docker-compose.yml`](file:///c:/Users/Admin/Desktop/smart-cafe-ai/docker-compose.yml), từng container đã được cấu hình chặt chẽ:
- **Eureka Server & API Gateway:** `-Xms64m -Xmx192m` / `-Xms128m -Xmx256m` (Netty & Discovery rất nhẹ).
- **Core Microservices:** `-Xms128m -Xmx384m` (Bộ nhớ heap tối đa 384MB).
- **Docker Memory Limit:** Giới hạn cgroup tối đa 512MB/service.
- **Tổng dung lượng RAM cần thiết:** Chỉ khoảng **3.5GB - 4.5GB** cho toàn bộ 13 containers (10 services + MySQL + RabbitMQ + Mailpit)!

---

## 2. Bảng Danh Mục Services & Cổng Mạng (Ports)

| Tên Container | Vai trò | Cổng Host | Endpoint Kiểm Tra |
| :--- | :--- | :--- | :--- |
| `smartcafe-mysql` | MySQL 8.0 (8 Databases) | `3306` | `mysqladmin ping` |
| `smartcafe-rabbitmq` | RabbitMQ + Management UI | `5672`, `15672` | `http://localhost:15672` |
| `smartcafe-mailpit` | Mock SMTP & Web UI | `1025`, `8025` | `http://localhost:8025` |
| `smartcafe-discovery-server` | Eureka Service Discovery | `8761` | `http://localhost:8761` |
| `smartcafe-api-gateway` | API Gateway (Reverse Proxy) | `8080` | `http://localhost:8080/actuator/health` |
| `smartcafe-identity-service` | Xác thực & Phân quyền JWT | `8081` | `http://localhost:8081/actuator/health` |
| `smartcafe-catalog-service` | Menu & Danh mục món | `8082` | `http://localhost:8082/actuator/health` |
| `smartcafe-store-service` | Chi nhánh, Bàn ăn, Nhân sự | `8083` | `http://localhost:8083/actuator/health` |
| `smartcafe-order-service` | Giỏ hàng, Đặt món | `8084` | `http://localhost:8084/actuator/health` |
| `smartcafe-payment-service` | Tiền mặt, VNPay, MoMo, VAT | `8085` | `http://localhost:8085/actuator/health` |
| `smartcafe-inventory-service` | Kho nguyên liệu, Xuất nhập | `8086` | `http://localhost:8086/actuator/health` |
| `smartcafe-engagement-service`| Điểm thưởng, Voucher, Đánh giá | `8087` | `http://localhost:8087/actuator/health` |
| `smartcafe-intelligence-service` | Trợ lý AI & Khuyến nghị | `8088` | `http://localhost:8088/actuator/health` |

---

## 3. Quy Trình Build & Khởi Chạy (Step-by-Step)

### Cách 1: Sử dụng Script tự động (Khuyên dùng - Nhanh nhất)

#### Trên Windows (PowerShell):
```powershell
.\build-docker.ps1
```

#### Trên Linux / macOS / Git Bash:
```bash
chmod +x build-docker.sh
./build-docker.sh
```

---

### Cách 2: Thực hiện thủ công qua lệnh

#### Bước 1: Đảm bảo Docker Desktop đang bật
Kiểm tra bằng lệnh:
```bash
docker info
```

#### Bước 2: Đóng gói toàn bộ 10 microservices qua Maven (Chỉ ~1 phút)
Thay vì để Docker tải hàng chục GB thư viện 10 lần riêng lẻ, ta build chung qua Maven Wrapper với Local Cache:
```bash
cd backend
./mvnw clean package -DskipTests
cd ..
```

#### Bước 3: Build các Docker Image siêu nhẹ với Layer Caching (Chỉ ~10 - 20 giây)
```bash
docker compose build
```

#### Bước 4: Khởi chạy toàn bộ hệ thống
```bash
docker compose up -d
```

> [!TIP]
> Docker Compose đã được cấu hình **Healthchecks** và điều kiện phụ thuộc (`depends_on`). MySQL và RabbitMQ sẽ khởi động trước, sau đó là Eureka Server, tiếp theo là các Core Services và cuối cùng là API Gateway.

---

## 4. Các Lệnh Quản Trị Hệ Thống Thường Dùng

### 1. Xem trạng thái các container:
```bash
docker compose ps
```

### 2. Xem log tập trung hoặc từng service:
```bash
# Xem log toàn bộ hệ thống
docker compose logs -f

# Xem log riêng một service (ví dụ: payment-service)
docker compose logs -f payment-service
```

### 3. Khởi động lại hoặc rebuild 1 service khi sửa code:
Ví dụ bạn vừa sửa code trong `payment-service`:
```bash
cd backend
./mvnw package -pl payment-service -DskipTests
cd ..
docker compose build payment-service
docker compose up -d --no-deps payment-service
```
*(Chỉ mất ~3 giây để service mới cập nhật mà không ảnh hưởng các service khác!)*

### 4. Dừng toàn bộ hệ thống:
```bash
# Dừng các container nhưng giữ nguyên dữ liệu MySQL & RabbitMQ
docker compose down

# Dừng và xóa toàn bộ volume dữ liệu (reset database về ban đầu)
docker compose down -v
```

---

## 5. Dữ Liệu Khởi Tạo (Database Initialization)

MySQL trong `docker-compose.yml` tự động mount file [`database/smart_cafe_db.sql`](file:///c:/Users/Admin/Desktop/smart-cafe-ai/database/smart_cafe_db.sql) vào `/docker-entrypoint-initdb.d/01-init.sql`.

Trong lần đầu tiên container `smartcafe-mysql` khởi động, toàn bộ **8 cơ sở dữ liệu** cùng bảng biểu, tài khoản phân quyền và dữ liệu mẫu sẽ được tạo hoàn toàn tự động.
