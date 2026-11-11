# Giao tiếp thật Order → Catalog → Store

Runtime dùng MySQL riêng cho từng service và gọi REST trực tiếp bằng `java.net.http.HttpClient`. Không có bean mock, H2 hoặc dữ liệu dự phòng trong `src/main`. H2 và Mockito hiện có chỉ phục vụ các bài kiểm thử riêng; chúng không phải cách lấy dữ liệu khi chạy ứng dụng.

Luồng đọc sản phẩm/giá:

1. `HttpOrderDependencies.resolve` gửi `POST http://localhost:8082/internal/catalog/resolve` với `X-Service-Key`, body có `branch_id` và `items`.
2. Catalog xác thực `CATALOG_INTERNAL_API_KEY`, gọi Store qua `GET http://localhost:8083/internal/branches/{id}` với `STORE_INTERNAL_API_KEY` để kiểm tra chi nhánh.
3. Store đọc bảng Branches trong MySQL Store. Catalog đọc sản phẩm/giá/topping trong MySQL Catalog và trả `data.items`.
4. Order tính tiền từ response và lưu snapshot khi tạo đơn vào MySQL Order. Không truy vấn trực tiếp database của service khác.

Thiếu khóa, service không chạy, chi nhánh không tồn tại hoặc sản phẩm không hợp lệ sẽ trả lỗi; không tự tạo chi nhánh, chọn chi nhánh giả hay trả giá mẫu để cho request thành công. Internal Branch của Store đã kiểm tra X-Service-Key; public Branch API vẫn giữ luồng hiện có.

## Cấu hình local

Tạo `.env` riêng trong từng thư mục `backend/store-service`, `backend/catalog-service`, `backend/order-service`; các file này được gitignore. Không dùng chung `SPRING_DATASOURCE_URL` của Identity cho cả ba service.

Mỗi file có:

```dotenv
SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/smart_cafe_<service>_db?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
SPRING_DATASOURCE_USERNAME=<MySQL user thật>
SPRING_DATASOURCE_PASSWORD=<MySQL password thật>
JWT_SECRET=<cùng giá trị với Identity>
STORE_INTERNAL_API_KEY=<khóa dùng chung giữa Store, Catalog và Order>
```

Thay `<service>` bằng `store`, `catalog` hoặc `order` tương ứng. Catalog và Order cần thêm:

```dotenv
STORE_INTERNAL_BASE_URL=http://localhost:8083/internal
STORE_INTERNAL_AUTH_HEADER=X-Service-Key
CATALOG_INTERNAL_API_KEY=<khóa dùng chung giữa Catalog và Order>
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=<tài khoản broker thật>
RABBITMQ_PASSWORD=<mật khẩu broker thật>
RABBITMQ_VHOST=/
```

Order cần thêm `ORDER_INTERNAL_API_KEY`; khi POS gắn khách hàng, cấu hình `IDENTITY_INTERNAL_API_KEY` khớp Identity đang chạy. Order đã mặc định Catalog URL là `http://localhost:8082/internal/catalog`. `STORE_INTERNAL_AUTH_VALUE` cũ vẫn dùng được nếu chưa khai báo `STORE_INTERNAL_API_KEY`.

Áp dụng migration 001 và 002 còn thiếu cho Order trước khi dùng API giỏ/đơn hàng. Script chạy giữ `ddl-auto=none` để không tự sửa database.

```powershell
./backend/tools/Start-CommerceServices.ps1 -JavaHome 'C:/Program Files/Java/jdk-26' -Build
```

Script nạp `.env` riêng cho mỗi tiến trình, build rồi chạy cửa sổ ẩn; log và PID hiện trong output. Nó không ghi dữ liệu nghiệp vụ, không tạo chi nhánh và không tắt tiến trình đang chiếm cổng. Nếu chạy bằng IDE, cấu hình các biến môi trường tương ứng cho từng Run Configuration; ứng dụng Catalog/Order/Store không tự nạp `.env` bằng main method.

## Kiểm tra không dùng mock

`OrderCatalogLiveIT` là bài kiểm tra opt-in: dùng Spring bean `HttpOrderDependencies` thật, datasource MySQL thật và hai tiến trình Catalog/Store thật. Không dùng profile test, MockBean hay server trả response dựng sẵn. Không chạy trong bộ test mặc định.

Sau khi nạp các biến của Order vào shell:

```powershell
$env:RUN_LIVE_ORDER_CATALOG='true'
$env:LIVE_BRANCH_ID='<ID chi nhánh thật đang có>'
$env:LIVE_VARIANT_ID='<ID biến thể thật đang bán, không bắt buộc topping>'
mvn -f backend/order-service/pom.xml -Dtest=OrderCatalogLiveIT test
```

Một bài kiểm tra yêu cầu chi nhánh không tồn tại phải bị từ chối ở cả Store và Catalog. Bài resolve thành công chỉ chạy nếu có hai ID thật; thiếu ID sẽ ghi rõ skipped, không tự thay bằng dữ liệu mẫu. Bài test này chỉ đọc dữ liệu, không tạo đơn/giỏ hàng và không gửi email.

## File thay đổi cho luồng này

- `backend/catalog-service/src/main/resources/application.yaml`: URL Store, header mặc định, biến khóa thống nhất.
- `backend/order-service/src/main/resources/application.yaml`: URL và khóa Store.
- `backend/store-service/src/main/resources/application.yaml`: cấu hình khóa nội bộ.
- `backend/catalog-service/pom.xml`, `backend/store-service/pom.xml`: phiên bản Lombok và annotation processing đã build được với JDK 26 trên máy, vẫn target Java 17.
- `backend/store-service/src/main/java/com/smart_cafe_ai/store_service/controller/InternalBranchController.java`: xác thực request nội bộ trước khi đọc chi nhánh.
- `backend/tools/Start-CommerceServices.ps1`: chạy ba service với cấu hình riêng, không mock.
- `backend/order-service/src/test/java/com/smart_cafe_ai/order_service/OrderCatalogLiveIT.java`: kiểm tra REST thật và MySQL thật.
- `backend/COMMERCE_REAL_INTEGRATION.md`: hướng dẫn và phạm vi kiểm chứng.

Luồng QR/POS còn phụ thuộc endpoint phiên bàn/hồ sơ nhân viên của Store; Delivery cần tọa độ chi nhánh mà BranchResponse Store hiện chưa trả. Không coi kiểm tra resolve là xác nhận toàn bộ checkout hoặc mọi tích hợp Backend 2 đã hoàn tất. REST voucher/đổi tem Order–Engagement đã được bổ sung; xem [ORDER_ENGAGEMENT_INTEGRATION.md](ORDER_ENGAGEMENT_INTEGRATION.md).

## Kết quả kiểm tra trên máy ngày 2026-11-02

- Đã tạo cấu hình `.env` local riêng cho ba service (gitignored), dùng credential MySQL hiện có và khóa nội bộ sinh ngẫu nhiên; không đưa credential vào tài liệu/commit.
- Đã áp migration 001 và 002 còn thiếu vào `smart_cafe_order_db`, chỉ thêm cấu trúc kỹ thuật; không tạo dữ liệu nghiệp vụ.
- Store 8083, Catalog 8082 và Order 8084 đã khởi động với MySQL thật, `ddl-auto=none`, không profile test.
- API Store thật: thiếu khóa → 401, sai khóa → 403, khóa đúng + chi nhánh không tồn tại → 404.
- Catalog resolve thật gọi Store thật và trả 404 BRANCH_NOT_FOUND khi chi nhánh không tồn tại. API Order nội bộ truy vấn MySQL thật trả 404 NOT_FOUND với đơn không tồn tại.
- `OrderCatalogLiveIT`: 2 ca, 1 thành công, 1 skipped, không failure/error. Ca đã thành công dùng bean HTTP production của Order, MySQL Order, Store và Catalog thật để xác minh từ chối chi nhánh không tồn tại. Ca resolve thành công skipped vì chưa có ID chi nhánh thật.
- `smart_cafe_store_db.Branches` hiện rỗng. Chưa xác nhận được luồng resolve thành công/checkout thành công; không tự tạo chi nhánh giả để thay thế. Cần bổ sung chi nhánh thật qua Store hoặc cấu hình database Store có dữ liệu, rồi chạy lại với LIVE_BRANCH_ID/LIVE_VARIANT_ID.
