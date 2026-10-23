# Catalog Service — 3 API xem thực đơn

Service Spring Boot độc lập, cổng `8082`, database riêng `smart_cafe_catalog_db`, đăng ký Eureka theo cấu hình hiện có. Triển khai theo `SmartAPI.xlsx` (sheet Chuẩn chung và 2. Catalog) và schema `SmartCoffeeDT.sql`. Word có các mô tả cũ như `Out_Of_Stock`, `rating_avg`, hard-delete; phần triển khai này dùng hợp đồng Excel/SQL: `Active/Inactive`, khả dụng theo bảng ngoại lệ của từng chi nhánh.

## Cấu trúc

```text
controller/   Nhận HTTP và query parameters
service/      Nghiệp vụ đọc thực đơn, ghép variants/options/availability
repository/   JPA, bộ lọc sản phẩm, truy vấn batch
model/        Mapping 7 bảng Catalog và enum
dto/          Response JSON snake_case, bộ lọc và validation
security/     Xác minh JWT khi yêu cầu danh mục Inactive
exception/    Chuẩn hóa HTTP status và response lỗi
```

Mỗi request chạy trong transaction read-only. DTO được tạo trong service; không trả trực tiếp entity JPA, không cần Open Session in View. Catalog không truy vấn database Identity/Store/Inventory. `branch_id` là external reference, không tạo khóa ngoại hay gọi Store để kiểm tra chi nhánh tồn tại trong 3 API này.

## API

Đường dẫn chuẩn qua Gateway: `http://localhost:8080/api/v1/catalog/...`. Gọi trực tiếp service: `http://localhost:8082/api/v1/catalog/...`. Alias `/catalog/...` cũng được hỗ trợ khi gọi trực tiếp, giống cách tổ chức Identity hiện tại. Gateway đã có route `/api/v1/catalog/**` nên không cần sửa route.

| Method | Endpoint | Xử lý |
| --- | --- | --- |
| GET | `/api/v1/catalog/categories` | Mặc định Active, sắp theo `sort_order`, rồi `id`; `product_count` chỉ đếm sản phẩm Active. |
| GET | `/api/v1/catalog/products` | Tìm tên, lọc danh mục/thuộc tính/giá, phân trang, sắp xếp, khả dụng theo chi nhánh. |
| GET | `/api/v1/catalog/products/{id}` | Thông tin sản phẩm + variants + option_groups/options + trạng thái khả dụng và lý do ngừng bán theo chi nhánh. |

Các API Active là public. `categories?status=Inactive` yêu cầu `Authorization: Bearer <access_token>` do Identity cấp, chữ ký và hạn dùng hợp lệ, claim `role` là `Manager` hoặc `Admin`. Catalog dùng cùng `JWT_SECRET` và cách giải mã khóa như Identity; không tin header vai trò từ client. Thiếu/sai/hết hạn token trả `401`, sai quyền trả `403`. Chưa triển khai API quản trị ghi dữ liệu.

### Query của danh sách sản phẩm

| Tham số | Giá trị |
| --- | --- |
| `q` | Tìm chuỗi trong tên, không phân biệt hoa thường, trim, tối đa 100 ký tự; `%`, `_` được tìm như ký tự thường. Khả năng tìm không dấu phụ thuộc collation MySQL. |
| `category_id`, `branch_id` | Số nguyên dương, tùy chọn. |
| `temperature` | `Hot`, `Iced`, `Blended`, `Hot_Or_Iced` (khớp giá trị enum chính xác). |
| `caffeine_level` | `None`, `Low`, `Medium`, `High`. |
| `flavor_tag` | Một tag, trim và chuyển lowercase, tối đa 30 ký tự; JSON membership chính xác, không tìm chuỗi con. |
| `min_price`, `max_price` | Lọc trên **giá hiển thị nhỏ nhất** của các biến thể Active, gồm hai đầu mút; số nguyên VND, không âm, tối đa 15 chữ số; min không vượt max. |
| `sort` | `name`, `price`, `sort_order`; có thể thêm `,asc` hoặc `,desc`. Mặc định `sort_order,asc`; luôn thêm `id,asc` để phân trang ổn định. |
| `page`, `size` | Mặc định `1`, `20`; page >= 1, size 1–100; giá trị sai trả `400`. |

Chỉ sản phẩm Active thuộc danh mục Active xuất hiện trong danh sách và chi tiết. Sản phẩm ẩn/không tồn tại trả `404 NOT_FOUND`. Tìm kiếm không có kết quả trả `200`, `data: []` và meta.

### Giá và khả dụng

- `price` / `max_price` là MIN / MAX của `Product_Variants.price` có status Active, giống view `v_products_full`; không lưu bản sao giá ở Products. Dùng BigDecimal và DECIMAL(15,0).
- Giá hiển thị không đổi theo chi nhánh. `branch_id` chỉ dùng để tính `is_available` và lý do ngừng bán; sản phẩm hết món vẫn hiện trong danh sách để UI hiển thị trạng thái.
- Variant/option Inactive không được trả trong API public. Variant/option Active được xem là khả dụng nếu không có dòng ngoại lệ của chi nhánh, hoặc dòng đó có `is_available=true`.
- Khi không truyền `branch_id`, khả dụng dựa trên trạng thái toàn hệ thống. Khi có `branch_id`, chỉ đọc đúng ngoại lệ của chi nhánh đó.
- Sản phẩm khả dụng khi có ít nhất một variant Active khả dụng. Sản phẩm chưa có variant Active vẫn hiện với giá `null`, variants rỗng và `is_available=false`.
- Nhóm tùy chọn giữ `selection_type`, `is_required`, `min_select`, `max_select`; option đang hết tại chi nhánh vẫn được trả cùng lý do. Chưa kiểm tra tính hợp lệ của tổ hợp lựa chọn khi đặt hàng — việc đó thuộc API resolve ở giai đoạn sau.
- Dùng truy vấn batch cho variants, options và branch availability, tránh truy vấn từng phần tử trong vòng lặp.

Response theo quy ước Excel:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "size": 20, "total": 0, "total_pages": 0 },
  "trace_id": "UUID"
}
```

`meta` chỉ có ở danh sách sản phẩm. Lỗi có `success:false`, `error:{code,message,details:[]}` và `trace_id`. Lỗi hệ thống trả `500` với thông báo chung; stack trace chỉ nằm trong log kèm trace_id.

## Chuẩn bị database và chạy

Yêu cầu Java 17, Maven, MySQL 8.0.17+. Schema riêng cho Catalog đã được tách nguyên phần Catalog từ SQL gốc tại `database/catalog/schema.sql`. Nếu đã import SQL gốc thì không chạy lại schema. Nếu database mới, mở MySQL client tại thư mục gốc dự án rồi chạy:

```sql
SOURCE database/catalog/schema.sql;
```

Schema chứa cấu trúc và các ràng buộc/index/view gốc, không tự tạo dữ liệu sản phẩm mẫu. Cấu hình mặc định dùng `ddl-auto: update` cho môi trường phát triển, giống Identity Service. Hibernate có thể tạo/cập nhật bảng entity nhưng không thay thế đầy đủ các CHECK, index JSON và view trong SQL gốc; nên import schema để có cấu trúc đầy đủ. Khi DB đã được tạo từ SQL, có thể đặt `SPRING_JPA_HIBERNATE_DDL_AUTO=validate` để chỉ kiểm tra cấu trúc. Giữ nguyên tên bảng viết hoa/thường theo SQL để chạy được trên MySQL có phân biệt tên bảng.

Để có dữ liệu mẫu test trên MySQL local, chạy theo thứ tự trong MySQL client từ thư mục gốc dự án:

```sql
SOURCE database/catalog/seed-categories.sql;
SOURCE database/catalog/seed-products.sql;
```

Các script chỉ thêm bản ghi còn thiếu, giữ dữ liệu đã có. Menu mẫu có Latte, Americano, Matcha Latte, Trà đào và một món Inactive. Latte có size M/L, nhóm mức đường và topping. Với Latte, chi nhánh 1 hết size M và trân châu nhưng còn size L; chi nhánh 2 hết cả M/L. Các mã chi nhánh này chỉ là external reference để thử API Catalog, không tạo dữ liệu Store. Lấy ID thực tế từ API danh sách khi thử chi tiết. Sau khi thêm sản phẩm, `product_count` của danh mục sẽ tăng; không tiếp tục dùng assertion tất cả product_count bằng 0.

Cấu hình biến môi trường trong terminal hoặc Run Configuration của IDE:

```powershell
$env:SPRING_DATASOURCE_URL = 'jdbc:mysql://localhost:3306/smart_cafe_catalog_db?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true'
$env:SPRING_DATASOURCE_USERNAME = 'root'
$env:SPRING_DATASOURCE_PASSWORD = '<mat-khau-mysql>'
$env:JWT_SECRET = '<cung-gia-tri-Identity>'
```

Catalog đọc biến môi trường hệ điều hành, chưa tự nạp file `.env`. Lưu ý `.env.example` ở gốc hiện trỏ đến database Identity; cần dùng URL Catalog như trên.

Từ thư mục gốc dự án:

```powershell
mvn -f backend/catalog-service/pom.xml spring-boot:run
```

Nếu chưa cài Maven vào PATH, có thể dùng wrapper đã có của dự án:

```powershell
.\backend\identity-service\mvnw.cmd -f backend/catalog-service/pom.xml spring-boot:run
```

Để gọi qua Gateway, chạy thêm discovery-server (`8761`) và api-gateway (`8080`). Khi chỉ chạy Catalog để phát triển, có thể đặt `EUREKA_CLIENT_ENABLED=false` và gọi cổng 8082.

```http
GET http://localhost:8082/api/v1/catalog/categories
GET http://localhost:8082/api/v1/catalog/products?q=latte&category_id=1&branch_id=1&sort=price,asc&page=1&size=20
GET http://localhost:8082/api/v1/catalog/products/1?branch_id=1
```

## Kiểm thử

```powershell
mvn -f backend/catalog-service/pom.xml test
```

`CatalogApiTest` dùng Spring Boot + MockMvc + repository thật với database H2 độc lập; không cần MySQL, Eureka hoặc Identity chạy. Bao phủ các API public, JWT danh mục Inactive, lọc kết hợp/JSON membership, giá từ variant, phân trang, dữ liệu ẩn, dữ liệu rỗng, kiểm tra đầu vào, branch availability và option groups.

H2 dùng hàm giả lập `JSON_CONTAINS` chỉ trong test. Cần kiểm tra thêm trên MySQL thực với schema gốc trước khi triển khai môi trường chạy chung; bộ test H2 không xác minh index JSON và collation riêng của MySQL.
