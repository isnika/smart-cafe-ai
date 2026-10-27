# Catalog Service — thực đơn, sản phẩm, biến thể và tùy chọn

Service Spring Boot độc lập, cổng `8082`, database riêng `smart_cafe_catalog_db`, đăng ký Eureka theo cấu hình hiện có. Triển khai theo `SmartAPI.xlsx` (sheet Chuẩn chung và 2. Catalog) và schema `SmartCoffeeDT.sql`. Word có các mô tả cũ như `Out_Of_Stock`, `rating_avg`, hard-delete; phần triển khai này dùng hợp đồng Excel/SQL: `Active/Inactive`, khả dụng theo bảng ngoại lệ của từng chi nhánh.

## Cấu trúc

```text
controller/   Nhận HTTP và query parameters
service/      Đọc thực đơn, quản lý danh mục/sản phẩm, audit và Outbox publisher
repository/   JPA, bộ lọc sản phẩm, truy vấn batch
model/        Mapping 11 bảng Catalog, gồm lịch sử giá, audit, outbox và processed events
dto/          Response JSON snake_case, bộ lọc và validation
security/     Xác minh JWT và quyền Manager/Admin cho quản trị Catalog
exception/    Chuẩn hóa HTTP status và response lỗi
```

Các thao tác đọc chạy trong transaction read-only; tạo/sửa/đổi trạng thái/xóa danh mục và audit chạy trong cùng transaction ghi. DTO được tạo trong service; không trả trực tiếp entity JPA, không cần Open Session in View. Catalog không truy vấn database Identity/Store/Inventory. `branch_id` và `actor_user_id` là external reference, không tạo khóa ngoại xuyên service. Theo yêu cầu bổ sung, cho phép hard delete danh mục trống tạo nhầm; danh mục có dữ liệu phụ thuộc vẫn phải giữ lại và chuyển Inactive.

## API

Đường dẫn chuẩn qua Gateway: `http://localhost:8080/api/v1/catalog/...`. Gọi trực tiếp service: `http://localhost:8082/api/v1/catalog/...`. Alias `/catalog/...` cũng được hỗ trợ khi gọi trực tiếp, giống cách tổ chức Identity hiện tại. Gateway định tuyến qua Eureka, kiểm tra JWT cho quản trị Catalog, chuyển tiếp X-Trace-Id và chặn API nội bộ. Catalog vẫn tự kiểm tra quyền khi được gọi trực tiếp.

Phân chia backend 1/backend 2 và các phần cần tích hợp được ghi tại [INTEGRATION_BACKEND_1_2.md](../INTEGRATION_BACKEND_1_2.md). Chưa có code backend 2 trong checkout để kiểm chứng tích hợp thực tế. Không có dữ liệu Store/Inventory giả làm fallback. Các request có chi nhánh sẽ trả 503 nếu chưa kết nối Store; Inventory consumer mặc định tắt.

| Method | Endpoint | Xử lý |
| --- | --- | --- |
| GET | `/api/v1/catalog/categories` | Mặc định Active, sắp theo `sort_order`, rồi `id`; `product_count` chỉ đếm sản phẩm Active. |
| GET | `/api/v1/catalog/products` | Tìm tên, lọc danh mục/thuộc tính/giá, phân trang, sắp xếp, khả dụng theo chi nhánh. |
| GET | `/api/v1/catalog/products/{id}` | Thông tin sản phẩm + variants + option_groups/options + trạng thái khả dụng và lý do ngừng bán theo chi nhánh. |
| GET | `/api/v1/catalog/admin/categories` | Manager/Admin xem cả Active/Inactive, tìm theo tên và phân trang. |
| POST | `/api/v1/catalog/categories` | Manager/Admin tạo danh mục, trả 201 và header Location. |
| PUT | `/api/v1/catalog/categories/{id}` | Manager/Admin thay thế thông tin danh mục. |
| PATCH | `/api/v1/catalog/categories/{id}/status` | Manager/Admin bật/tắt danh mục, không xóa dữ liệu. |
| DELETE | `/api/v1/catalog/categories/{id}` | Manager/Admin xóa vĩnh viễn danh mục không còn dữ liệu phụ thuộc, trả 200 kèm thông báo. |
| GET | `/api/v1/catalog/admin/products` | Manager/Admin xem sản phẩm Active/Inactive, kể cả thuộc danh mục Inactive, lọc và phân trang. |
| POST | `/api/v1/catalog/products` | Manager/Admin tạo sản phẩm, có thể kèm variants/option_groups/options trong cùng transaction; trả 201 và Location. |
| PUT | `/api/v1/catalog/products/{id}` | Manager/Admin thay thế thông tin chung, giữ nguyên variants/options. |
| PATCH | `/api/v1/catalog/products/{id}/status` | Manager/Admin đổi trạng thái, ghi audit và sự kiện Outbox khi thực sự thay đổi. |
| DELETE | `/api/v1/catalog/products/{id}` | Manager/Admin xóa sản phẩm tạo nhầm chưa có biến thể/nhóm tùy chọn; có liên kết trả 409. |
| POST | `/api/v1/catalog/products/{productId}/variants` | Thêm biến thể cho sản phẩm đã tồn tại, 201. |
| PUT | `/api/v1/catalog/variants/{id}` | Thay tên/thứ tự/trạng thái; không nhận giá. |
| PATCH | `/api/v1/catalog/variants/{id}/price` | Đổi giá, ghi lịch sử, audit và outbox trong cùng transaction. |
| GET | `/api/v1/catalog/variants/{id}/price-history` | Lịch sử giá, phân trang từ 1, size 1–100, mới nhất trước. |
| PATCH | `/api/v1/catalog/variants/{id}/status` | Đổi trạng thái biến thể, giữ lịch sử và các liên kết. |
| PUT | `/api/v1/catalog/branches/{branchId}/variants/{variantId}/availability` | Ngoại lệ bán biến thể theo chi nhánh; cần Store xác minh chi nhánh. |
| POST | `/api/v1/catalog/products/{productId}/option-groups` | Tạo nhóm tùy chọn độc lập, 201; có thể chưa thêm options. |
| PUT | `/api/v1/catalog/option-groups/{id}` | Thay quy tắc lựa chọn và tên/thứ tự nhóm. |
| POST | `/api/v1/catalog/option-groups/{groupId}/options` | Thêm tùy chọn cho nhóm, 201. |
| PUT | `/api/v1/catalog/options/{id}` | Thay thông tin tùy chọn và phụ phí. |
| PATCH | `/api/v1/catalog/options/{id}/status` | Bật/tắt tùy chọn. |
| PUT | `/api/v1/catalog/branches/{branchId}/options/{optionId}/availability` | Ngoại lệ tùy chọn theo chi nhánh; cần Store xác minh chi nhánh. |
| POST | `/internal/catalog/resolve` | Nội bộ Order/Cart gọi; kiểm tra giá, lựa chọn và khả dụng; cần Store. Không mở qua Gateway công khai. |

24 API trong sheet Catalog và 2 DELETE bổ sung theo yêu cầu đã có handler. Các handler phụ thuộc Store vẫn cần tích hợp backend 2 mới chạy thành công với chi nhánh thực tế.

Các API GET xem thực đơn Active là public. `categories?status=Inactive` và 5 API quản trị danh mục yêu cầu `Authorization: Bearer <access_token>` do Identity cấp, chữ ký và hạn dùng hợp lệ, claim `role` là `Manager` hoặc `Admin`. Catalog dùng cùng `JWT_SECRET` và cách giải mã khóa như Identity; không tin header vai trò từ client. Thiếu/sai/hết hạn token trả `401`, sai quyền trả `403`. `@ManagerOnly` và MVC interceptor bảo vệ các API quản trị trước bước đọc/validate body, áp dụng cho cả alias `/catalog` và `/api/v1/catalog`.

### Quản trị danh mục và nghiệp vụ

`GET /catalog/admin/categories?q=ca%20phe&status=Inactive&sort=sort_order,asc&page=1&size=20`:

- Bỏ `status` để xem cả Active và Inactive. `status` khác `Active`/`Inactive` trả `400 VALIDATION_ERROR`.
- `q` tìm chuỗi trong tên không phân biệt hoa thường/dấu tiếng Việt, kể cả `đ/Đ`: `ca phe` tìm được “Cà phê”, `do uong` tìm được “Đồ uống”. Chuẩn hóa Unicode và khoảng trắng ở query; các phép lower/fold ký tự chạy trong truy vấn SQL trước khi lọc, đếm tổng và phân trang. Cùng một bộ quy tắc dùng cho MySQL/H2, không phụ thuộc collation mặc định để bỏ dấu tiếng Việt. `%`, `_`, `!` được tìm như ký tự thường, không phải regex/wildcard do client điều khiển.
- `page` mặc định 1, `size` mặc định 20; page >= 1, size từ 1–100. Âm/0/sai kiểu hoặc size > 100 trả `400 VALIDATION_ERROR`. Không có kết quả, database rỗng hoặc trang vượt quá tổng số trang vẫn trả 200, `data: []`, meta chính xác.
- `sort` cho phép `id`, `name`, `sort_order`, `status`, kèm `,asc` hoặc `,desc`; bỏ chiều thì dùng asc. Mặc định `sort_order,asc`. Luôn thêm `id,asc` làm tiêu chí phụ trừ khi đang sort theo id. Field/chiều sai, kể cả yêu cầu sort theo các trường đếm chưa được hỗ trợ, trả 400; không chèn trực tiếp tham số sort vào SQL.
- Trả `CategoryAdminResponse` và `meta`: `total_product_count` đếm tất cả sản phẩm trong danh mục; `active_product_count` chỉ đếm sản phẩm Active, kể cả khi danh mục đang Inactive. Trường `product_count` cũ được giữ bằng active_product_count để tương thích client. Danh mục không có sản phẩm trả cả hai số bằng 0. Dùng một truy vấn GROUP BY cho cả trang, đếm Products, không đếm variants/options.
- `total_product_count = 0` giúp nhận biết danh mục có thể cần xóa. API DELETE vẫn kiểm tra lại dữ liệu hiện tại và ràng buộc khóa ngoại khi thực hiện, vì số đếm có thể đã thay đổi sau khi tải danh sách. Không có cờ `can_delete`.

Ví dụ một phần tử trong danh sách quản trị:

```json
{
  "id": 10,
  "name": "Cà phê",
  "image": null,
  "status": "Active",
  "sort_order": 1,
  "total_product_count": 12,
  "active_product_count": 9,
  "product_count": 9
}
```

Body POST/PUT (JSON snake_case):

```json
{
  "name": "Cà phê rang xay",
  "image": "https://example.com/coffee.png",
  "sort_order": 1,
  "status": "Active"
}
```

- `name` bắt buộc: chuẩn hóa Unicode NFC, gộp khoảng trắng, trim, tối đa 100 ký tự; không nhận ký tự điều khiển/ẩn. Cho phép chữ, số và dấu câu để đặt tên danh mục thực tế.
- Tên không được trùng cả với danh mục Inactive. Kiểm tra không phân biệt hoa thường; MySQL dùng thêm quy tắc collation của schema gốc (ví dụ coi tên khác dấu là tương đương). Khi cập nhật, tên hiện tại của chính danh mục được phép giữ nguyên.
- `image` tùy chọn: `null` hoặc rỗng để bỏ ảnh; nếu có phải là URL HTTP/HTTPS hợp lệ, tối đa 255 ký tự, không chứa thông tin đăng nhập. API này chỉ lưu URL, không tải hay upload ảnh.
- `sort_order` là số nguyên JSON không âm, mặc định 0. `status` chỉ nhận đúng `Active`/`Inactive`, mặc định Active. Không nhận số thay enum, chuỗi thay số, explicit null cho sort_order/status hoặc tên trường không được hỗ trợ.
- **PUT thay thế các trường có thể sửa**: bắt buộc name; bỏ image sẽ xóa ảnh, bỏ sort_order sẽ về 0, bỏ status sẽ về Active. Client nên gửi đầy đủ body để giữ các giá trị hiện tại. Chỉ đổi trạng thái thì dùng PATCH.
- Không tìm thấy ID trả 404; trùng tên trả `409 CATEGORY_NAME_EXISTS`. UNIQUE(name) tại DB là lớp bảo vệ cuối cho hai request tạo/đổi tên trùng cùng lúc.

Body PATCH:

```json
{ "status": "Inactive" }
```

PATCH chỉ nhận trường status và trả `data: {id,status}`. Gửi lại cùng trạng thái trả 200, không ghi thêm audit. PATCH không xóa danh mục hoặc đổi status của sản phẩm con: tắt danh mục ẩn danh mục/sản phẩm khỏi menu public và chi tiết trả 404; bật lại chỉ hiện các sản phẩm vốn Active, sản phẩm Inactive vẫn ẩn. Các variants/options và lịch sử đã lưu được giữ nguyên.

Tạo/sửa/đổi trạng thái/xóa thực sự sẽ ghi `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_STATUS_CHANGED`, `CATEGORY_DELETED` vào `Audit_Logs`: actor lấy từ JWT đã xác minh, IP lấy từ kết nối (không tin X-Forwarded-For do client tự gửi), entity ID, dữ liệu trước/sau và thời gian UTC. Khi xóa, lưu snapshot cũ và `new_value = null`; giữ nguyên lịch sử audit trước đó. Nếu ghi audit thất bại, thay đổi hoặc xóa danh mục rollback cùng transaction. PUT không thay đổi dữ liệu không tạo audit thừa.

PUT/PATCH/DELETE khóa dòng danh mục trong transaction để tuần tự hóa các thao tác đồng thời; lỗi timeout/deadlock khóa trả `409 CONCURRENT_MODIFICATION` để client thử lại. DELETE kết hợp khóa dòng và khóa ngoại không cho phép xóa cha đang có sản phẩm, bảo vệ cả trường hợp thêm sản phẩm đồng thời. Schema Categories chưa có version nên cơ chế này không phát hiện một form PUT đã cũ trên client; client cần tải lại thông tin trước khi chỉnh sửa. Các thao tác danh mục không tạo event không được định nghĩa trong tài liệu.

Test trực tiếp trong Postman: base URL `http://localhost:8082/catalog`, Authorization → Bearer Token dùng access token Manager/Admin, Body → raw → JSON cho POST/PUT/PATCH. Tạo POST trước, lấy `data.id` trả về để dùng cho PUT/PATCH. Qua Gateway dùng `http://localhost:8080/api/v1/catalog`.

### Xóa danh mục tạo nhầm

Trong Postman chọn **DELETE** `http://localhost:8082/catalog/categories/{id}`, thay `{id}` bằng ID thật, dùng Bearer Token Manager/Admin, không gửi body.

- Danh mục không có sản phẩm được xóa vĩnh viễn dù đang Active hay Inactive. Trả `200 OK` và thông báo xác nhận.
- Có bất kỳ sản phẩm nào liên kết, kể cả sản phẩm Inactive: trả `409 CATEGORY_IN_USE`. Không xóa sản phẩm, không tự đổi trạng thái danh mục. Muốn ngừng hiển thị thì gọi PATCH status với `{"status":"Inactive"}`.
- Ràng buộc khóa ngoại trong database tiếp tục chặn xóa nếu còn dữ liệu phụ thuộc cần bảo toàn. Hiện schema Catalog có liên kết trực tiếp từ Products đến Categories.
- ID không hợp lệ trả 400; ID không tồn tại hoặc đã xóa trả 404. Thiếu token trả 401, sai quyền trả 403. Hai request xóa cùng ID chỉ một request thành công và ghi audit một lần.
- Sau khi xóa, có thể tạo lại tên danh mục với ID mới; lịch sử audit vẫn giữ ID cũ.

Ví dụ thành công:

```json
{
  "success": true,
  "data": { "id": 10 },
  "message": "Xóa danh mục thành công.",
  "trace_id": "UUID"
}
```

Ví dụ không được xóa do có sản phẩm (HTTP 409):

```json
{
  "success": false,
  "error": {
    "code": "CATEGORY_IN_USE",
    "message": "Không thể xóa danh mục vì vẫn còn sản phẩm liên kết, kể cả sản phẩm đã ngừng bán. Vui lòng chuyển danh mục sang Inactive để ngừng hiển thị.",
    "details": []
  },
  "trace_id": "UUID"
}
```

### Quản trị sản phẩm

Năm API quản trị sản phẩm dùng cùng JWT Manager/Admin và cùng hai prefix `/catalog`, `/api/v1/catalog`. Không truy cập database Order/Inventory/Identity. Các quy tắc bên dưới bổ sung cho phần danh mục; mọi lỗi đều có `error.code`, thông báo tiếng Việt và `trace_id`.

`GET http://localhost:8082/catalog/admin/products?q=ca%20phe&category_id=1&status=Inactive&sort=sort_order,asc&page=1&size=20`:

- Bỏ status để xem cả Active/Inactive, bao gồm sản phẩm thuộc danh mục Inactive. Trạng thái category được trả riêng qua `category_status`; status là trạng thái của chính sản phẩm.
- `q` tìm tên theo cùng quy tắc không dấu/hoa thường/đ-Đ như quản trị danh mục; `%`, `_`, `!` là ký tự thường.
- `category_id` phải nguyên dương. Bộ lọc không khớp hoặc category không tồn tại trả 200 với `data: []`.
- `page` từ 1; `size` từ 1–100; sort whitelist `id`, `name`, `price`, `sort_order`, `status`, `created_at`, `updated_at`, chiều asc/desc, mặc định `sort_order,asc`, thêm id để phân trang ổn định. Giá null xếp theo quy tắc null của database.
- Giá MIN/MAX chỉ tính variants Active. `variant_count` đếm mọi variants, `active_variant_count` đếm Active, `option_group_count` đếm nhóm; đếm theo batch, không nhân số lượng theo options. `is_available` là khả dụng toàn hệ thống, yêu cầu product/category Active và có variant Active, không phải khả dụng của một chi nhánh.

Body POST tối thiểu:

```json
{
  "category_id": 1,
  "name": "Sinh tố xoài"
}
```

Body POST có cấu hình đầy đủ:

```json
{
  "category_id": 1,
  "name": "Cà phê sữa thử nghiệm",
  "image": null,
  "description": "Cà phê kết hợp sữa tươi",
  "temperature": "Hot_Or_Iced",
  "caffeine_level": "Medium",
  "flavor_tags": ["creamy", "sweet"],
  "sort_order": 1,
  "status": "Active",
  "variants": [
    {"variant_name": "M", "price": 35000, "sort_order": 1, "status": "Active"},
    {"variant_name": "L", "price": 45000, "sort_order": 2, "status": "Active"}
  ],
  "option_groups": [
    {
      "name": "Mức đường",
      "selection_type": "Single",
      "is_required": true,
      "min_select": 1,
      "max_select": 1,
      "sort_order": 1,
      "options": [
        {"option_name": "Bình thường", "extra_price": 0, "is_default": true},
        {"option_name": "Ít đường", "extra_price": 0}
      ]
    }
  ]
}
```

Quy tắc tạo/sửa:

- `category_id` bắt buộc và phải tồn tại (404 nếu đã xóa). Cho phép chuẩn bị sản phẩm trong danh mục Inactive nhưng menu public vẫn ẩn; API trả thông báo giải thích.
- `name` bắt buộc, tối đa 100 ký tự Unicode, NFC, gộp khoảng trắng, không ký tự điều khiển/ẩn. SQL thiết kế không có UNIQUE trên Products.name nên không tự áp thêm quy tắc cấm trùng tên sản phẩm. ID phân biệt các sản phẩm. Danh mục và tên các cấu hình con vẫn tuân thủ UNIQUE trong schema.
- `image` tùy chọn URL HTTP/HTTPS tối đa 255 ký tự; không tải file từ URL. `description` tùy chọn, NFC, giữ xuống dòng, tối đa 65.535 byte UTF-8 theo TEXT MySQL.
- `temperature` chỉ Hot/Iced/Blended/Hot_Or_Iced hoặc null; null phù hợp món ăn. `caffeine_level` mặc định None, nhận None/Low/Medium/High.
- `flavor_tags` là mảng tối đa 20 chuỗi không rỗng, mỗi tag tối đa 30 ký tự, trim/gộp khoảng trắng, lowercase và loại trùng; null/bỏ qua chuyển về mảng rỗng.
- `sort_order` nguyên không âm, mặc định 0; `status` Active/Inactive, mặc định Active. Không nhận enum bằng số, chuỗi thay số, trường không hỗ trợ hoặc explicit null cho trường có default bắt buộc.
- POST hỗ trợ tối đa 100 variants, 20 nhóm, 100 options mỗi nhóm. Mỗi variant cần `variant_name` (50 ký tự) và `price`; giá/extra_price là số JSON nguyên VND từ 0 đến 999999999999999. Không có trường price trực tiếp trên product. Tên nhóm tối đa 50, option tối đa 100; tên con không trùng trong cùng phạm vi. Trùng cấu hình trả 409 và không lưu dở dang.
- Nhóm Single có max_select=1; Multiple tối đa 255; 0 ≤ min ≤ max, max ≥ 1. Nhóm bắt buộc cần min ≥ 1. Có thể tạo nhóm trước rồi thêm options bằng API riêng. Nhóm không bắt buộc có thể có min > 0: không chọn thì hợp lệ, đã chọn phải đạt min. is_default là dữ liệu gợi ý; server không tự thêm option vào giỏ. API resolve kiểm tra tổ hợp thực sự khách gửi, trạng thái và min/max, tránh áp thêm ràng buộc không có trong SQL khi đang cấu hình dở.
- Không bắt buộc tạo variant ngay. Sản phẩm chưa có variant Active có price=null, is_available=false và message nhắc chưa thể bán; hành vi menu public hiện có được giữ nguyên.
- POST trả đầy đủ variants/options vừa tạo (cả Inactive). Thông tin product, toàn bộ con và audit PRODUCT_CREATED là một transaction; có lỗi thì rollback tất cả.
- PUT bắt buộc category_id/name và thay toàn bộ trường thông tin chung. Bỏ trường tùy chọn sẽ đưa về null/mảng rỗng/default tương ứng; variants/option_groups không được gửi trong PUT để tránh xóa nhầm cấu hình/lịch sử giá. Cấu hình con dùng các API riêng trong bảng trên. No-op trả 200 với message, không thêm audit/event hoặc đổi updated_at.

PATCH `http://localhost:8082/catalog/products/{id}/status` chỉ nhận:

```json
{ "status": "Inactive" }
```

Trả `data: {id,status,updated_at}`. Chỉ thay trạng thái product, giữ category/variant/option/branch availability. Inactive ẩn khỏi menu public; bật lại không kích hoạt các con Inactive. Gửi lại cùng trạng thái không tạo audit/event thừa. PUT đổi status cũng phải ghi cùng event như PATCH. created_at/updated_at lưu UTC.

DELETE `http://localhost:8082/catalog/products/{id}` không có body:

- Xóa được product Active hoặc Inactive chưa có variant hay nhóm tùy chọn. Mục đích là dọn bản ghi tạo nhầm, không xóa cây sản phẩm đã cấu hình.
- Bất kỳ variant (kể cả Inactive) hoặc nhóm tùy chọn (kể cả rỗng) đều chặn xóa: `409 PRODUCT_IN_USE`, message yêu cầu chuyển product sang Inactive. Variant có thể đã được Order/Inventory tham chiếu nên không cascade-delete; lịch sử giá, tùy chọn và dữ liệu chi nhánh được giữ nguyên.
- Khóa product và FK RESTRICT bảo vệ trường hợp thêm variant/nhóm đồng thời. Audit PRODUCT_DELETED giữ snapshot cũ; lỗi audit rollback thao tác xóa. Lịch sử cũ giữ lại, không reset AUTO_INCREMENT.
- Không tồn tại/đã xóa trả 404, ID sai trả 400; thiếu token 401/sai quyền 403. Thành công 200 với `data: {id}` và message “Xóa sản phẩm thành công.”
- Bảo vệ liên kết hiện tại trong Catalog; không giả lập việc kiểm tra các database service khác. Khi bổ sung các tham chiếu product trực tiếp ở service khác, cần thêm cơ chế hợp đồng/API/event xác nhận sử dụng trước khi mở rộng điều kiện hard delete.

**Outbox và RabbitMQ:** thay đổi trạng thái thực sự ghi `catalog.product.status_changed` vào Outbox_Events trong cùng transaction với product/audit, payload gồm event_id/product_id/status/changed_at UTC và event_version. Nếu audit hoặc outbox lỗi, toàn bộ thao tác rollback. Publisher nền gửi persistent message đến topic exchange `smart-cafe.catalog`, routing key `catalog.product.status_changed`, message_id là event_id, chờ broker confirm và kiểm tra returned message. Mỗi consumer (Order/Intelligence) phải tạo durable queue/binding riêng và xử lý idempotent theo event_id; Catalog không triển khai consumer thay các service đó. Chưa có binding hoặc broker mất kết nối thì giữ Pending và retry; HTTP không chờ RabbitMQ. Event cùng product được phát theo ID cũ trước. Có thể giao lại sau crash nên consumer không được giả định exactly-once.

Đổi giá qua PATCH variants/{id}/price ghi Variant_Price_History (old_price/new_price/changed_by/changed_at), audit và `catalog.variant.price_changed` cùng transaction. changed_by lấy từ JWT đã xác minh, không lấy từ body. Giá giữ nguyên không tạo lịch sử hay sự kiện thừa. Publisher hỗ trợ cả hai loại sự kiện; thứ tự được giữ trong từng aggregate Product/Variant.

RabbitMQ dùng cùng các biến RABBITMQ_HOST/PORT/USERNAME/PASSWORD/VHOST như Identity; mặc định localhost:5672, vhost /. Khi chỉ test REST local có thể đặt `CATALOG_EVENTS_PUBLISHER_ENABLED=false`; event vẫn được lưu Pending và phát khi bật lại. Không tự gửi API HTTP sang service khác khi sửa sản phẩm.

Trong Postman dùng Bearer Token Manager/Admin cho cả 5 request. Tạo bằng POST trước và lấy data.id; thay `{id}` bằng số thực tế, không giữ dấu ngoặc nhọn. Để test DELETE thành công, tạo product tối thiểu không kèm variants/option_groups. Để test chặn xóa, tạo body đầy đủ phía trên rồi DELETE ID vừa tạo; mong đợi 409. Có thể import `postman/catalog-product-admin.postman_collection.json`, điền biến access_token và category_id trong Collection Variables, base_url mặc định localhost:8082/catalog. Collection tự lưu ID mới và kiểm tra HTTP status; chỉ DELETE ID được tạo trong luồng thử tương ứng. Hướng dẫn query menu public ở phần dưới.

### Query của danh sách sản phẩm public

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
- Khi không truyền `branch_id`, khả dụng dựa trên trạng thái toàn hệ thống. Khi có `branch_id`, gọi Store xác minh chi nhánh trước, rồi chỉ đọc đúng ngoại lệ của chi nhánh đó. Không cấu hình Store trả `503 STORE_INTEGRATION_NOT_CONFIGURED`; Store lỗi/sai hợp đồng trả `503 STORE_UNAVAILABLE`; Store trả 404 thì Catalog trả `404 BRANCH_NOT_FOUND`. Không có bản ghi ngoại lệ không đồng nghĩa Inventory đã xác nhận đủ nguyên liệu.
- Sản phẩm khả dụng khi có ít nhất một variant Active khả dụng. Sản phẩm chưa có variant Active vẫn hiện với giá `null`, variants rỗng và `is_available=false`.
- Nhóm tùy chọn giữ `selection_type`, `is_required`, `min_select`, `max_select`; option đang hết tại chi nhánh vẫn được trả cùng lý do. GET thực đơn không kiểm tra giỏ hàng. API nội bộ resolve kiểm tra tổ hợp lựa chọn trước khi Order tạo snapshot.
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

`meta` có ở danh sách sản phẩm và danh sách danh mục quản trị. Lỗi có `success:false`, `error:{code,message,details:[]}` và `trace_id`. Lỗi hệ thống trả `500` với thông báo chung; stack trace chỉ nằm trong log kèm trace_id.

### Thông báo cho giao diện

Response thành công có thêm `message` khi cần xác nhận thao tác hoặc giải thích trạng thái rỗng. Các request GET có dữ liệu không thêm thông báo không cần thiết. Frontend dùng `message` để hiện xác nhận cho POST/PUT/PATCH/DELETE hoặc gợi ý ở danh sách rỗng; khi có lỗi, đọc `error.message`. Tiếp tục dựa vào HTTP status và error.code để xử lý nghiệp vụ, không phân tích nội dung tiếng Việt.

Trong danh sách quản trị sản phẩm, `description` luôn là mô tả thực tế của món. Không ghi thông báo ngừng bán hoặc nội dung kiểm thử vào trường này. Đổi status không thay description; GET admin vẫn trả mô tả đã lưu, kể cả khi status là Inactive.

Ví dụ dữ liệu trả về (trích các trường liên quan):

```json
{
  "name": "Cà phê sữa đá",
  "description": "Cà phê đậm đà kết hợp cùng sữa đặc.",
  "status": "Inactive"
}
```

Frontend dựa vào `status` để hiển thị nhãn **Ngừng bán** và lời nhắc: “Sản phẩm hiện đã ngừng bán và không hiển thị trên menu khách hàng. Bạn có thể kích hoạt lại khi cần.” Lời nhắc này thuộc giao diện, không thay thế description và không thêm message chung cho toàn bộ danh sách chỉ vì có một sản phẩm Inactive. Khi kích hoạt lại, sản phẩm vẫn cần danh mục Active để hiển thị và biến thể Active để có thể bán.

| Trường hợp | Thông báo |
| --- | --- |
| POST tạo danh mục | Tạo danh mục thành công. |
| PUT thay đổi thông tin | Cập nhật danh mục thành công. |
| PUT dữ liệu giống hiện tại | Thông tin danh mục không thay đổi. |
| PATCH Active | Kích hoạt danh mục thành công. |
| PATCH Inactive | Đã ngừng hiển thị danh mục và các sản phẩm thuộc danh mục trên thực đơn. |
| PATCH trạng thái vốn đã đúng | Danh mục đã ở trạng thái đang hiển thị/ngừng hiển thị. |
| DELETE danh mục trống | Xóa danh mục thành công. |
| GET admin chưa có danh mục | Chưa có danh mục nào. Bạn có thể tạo danh mục mới. |
| GET admin không khớp bộ lọc | Không tìm thấy danh mục phù hợp. Bạn hãy thử thay đổi bộ lọc. |
| GET admin vượt số trang | Trang này chưa có danh mục. Bạn hãy chọn trang trước. |

Ví dụ PATCH thành công:

```json
{
  "success": true,
  "data": { "id": 10, "status": "Active" },
  "message": "Kích hoạt danh mục thành công.",
  "trace_id": "UUID"
}
```

Lỗi nhập liệu có thông báo cụ thể theo trường: “Vui lòng nhập tên danh mục.”, “Thứ tự hiển thị phải là số nguyên không âm.”, “Số mục trên mỗi trang phải là số nguyên từ 1 đến 100.”. Lỗi JSON được chuyển thành thông báo dễ đọc, không trả exception nội bộ hoặc chi tiết database cho client. Token hết hạn thông báo phiên đăng nhập đã hết hạn và đề nghị đăng nhập lại; trùng tên gợi ý chọn tên khác hoặc kích hoạt lại danh mục đang ngừng hiển thị.

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

Các script chỉ thêm bản ghi còn thiếu, giữ dữ liệu đã có. Menu mẫu có Latte, Americano, Matcha Latte, Trà đào và một món Inactive. Latte có size M/L, nhóm mức đường và topping. Script không tự gán ID chi nhánh của Store. Sau khi Store sẵn sàng, dùng ID chi nhánh thật qua API availability. Nếu từng chạy bản seed cũ chứa chi nhánh 1/2, cần đối chiếu với Store; bản sửa không tự xóa dữ liệu đã có. Sau khi thêm sản phẩm, `product_count` của danh mục sẽ tăng.

Nếu đã chạy seed cũ và mô tả món Inactive còn là “Dữ liệu kiểm tra ẩn sản phẩm Inactive.”, chạy bản sửa dữ liệu sau trong MySQL client:

```sql
SOURCE database/catalog/fix-sample-product-description.sql;
```

Script chỉ sửa description khi tên danh mục, tên món mẫu và nội dung mô tả cũ còn khớp. Không đổi status, không ghi đè mô tả Admin đã sửa; chạy lại không sửa thêm dữ liệu. Chạy lại seed-products.sql đơn thuần không cập nhật bản ghi đã tồn tại.

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
GET http://localhost:8082/api/v1/catalog/products?q=latte&category_id=1&sort=price,asc&page=1&size=20
GET http://localhost:8082/api/v1/catalog/products/1
```

## Kiểm thử

```powershell
mvn -f backend/catalog-service/pom.xml test
```

`CatalogApiTest` dùng Spring Boot + MockMvc + repository thật với database H2 độc lập; không cần MySQL, Eureka hoặc Identity chạy. Bao phủ các API public, JWT danh mục Inactive, lọc kết hợp/JSON membership, giá từ variant, phân trang, dữ liệu ẩn, dữ liệu rỗng, kiểm tra đầu vào, branch availability và option groups.

`CategoryAdminApiTest` kiểm tra CRUD danh mục, phân quyền cả hai alias, kiểu JSON nghiêm ngặt, Content-Type, tên trùng, chuẩn hóa Unicode/khoảng trắng, tìm có dấu/không dấu và đ/Đ, whitelist sort, phân trang ổn định, đếm tổng/Active, audit và ảnh hưởng đến menu public. DELETE bao phủ danh mục trống Active/Inactive, chặn mọi sản phẩm kể cả Inactive, giữ audit và tạo lại tên sau khi xóa. `CategoryAdminTransactionTest` kiểm tra rollback khi audit lỗi (gồm DELETE), tranh chấp tên đồng thời, khóa dòng, PATCH idempotent, xóa đồng thời và khóa ngoại chặn xóa khi kiểm tra trước bỏ sót liên kết.

`ProductAdminApiTest` kiểm tra 5 API sản phẩm, validation JSON nghiêm ngặt, cấu hình lồng nhau, giá từ variant, dữ liệu ẩn, danh sách quản trị, PUT replacement, idempotency và chặn xóa. `ProductAdminTransactionTest` kiểm tra rollback toàn bộ cây sản phẩm, rollback khi outbox/audit lỗi, FK chặn xóa, tạo/đổi trạng thái/xóa đồng thời và thứ tự pending event. `CatalogEventPublisherTest` kiểm tra persistent message, broker confirm, retry khi broker lỗi/nack hoặc không có route. Các test H2 không cần broker chạy.

`CatalogConfigurationApiTest` kiểm tra biến thể/giá/lịch sử/nhóm/options/availability, audit và phân quyền. `CatalogResolveApiTest` kiểm tra service key, snapshot giá, quyền sở hữu tùy chọn, trạng thái và giới hạn lựa chọn. Hai nhóm test dùng Store mock chỉ trong src/test. `UnavailableStoreApiTest` dùng adapter production không có cấu hình Store để xác nhận 503, không giả thành công; `StoreIntegrationBoundaryTest` kiểm tra response của HTTP adapter bằng server trong test. `InventoryAvailabilityTest` kiểm tra idempotency low_stock và không tự bật món từ restocked khi thiếu hợp đồng xác nhận đủ tồn.

H2 dùng hàm giả lập `JSON_CONTAINS` chỉ trong test. Để kiểm tra thêm collation, schema SQL gốc, audit JSON và request đồng thời trên MySQL, sau `mvn test` chạy:

```powershell
python -X utf8 backend/catalog-service/tools/check-category-admin-mysql.py
```

Script cần quyền CREATE/DROP DATABASE và MySQL client trên PATH (hoặc biến `MYSQL_CLIENT` trỏ đến mysql.exe). Script dùng credential datasource hiện tại, tạo database `smart_cafe_catalog_test_<random>` riêng, import schema gốc, chạy JVM ở cổng local trống với `ddl-auto=validate`, test qua HTTP rồi dừng JVM/xóa đúng database thử nghiệm. Không đổi database Catalog đang dùng. Bao phủ collation tên, tìm kiếm tiếng Việt (cả dữ liệu Unicode decomposed import từ SQL), sort, thống kê sản phẩm, audit JSON, DELETE danh mục/sản phẩm, tạo sản phẩm lồng nhau, rollback khi trùng tên con theo collation MySQL, status Outbox và concurrency. Gồm thêm sản phẩm trong lúc xóa danh mục, thêm variant trong lúc xóa product và hai PUT đổi tên trùng để kiểm tra bảo toàn dữ liệu. Publisher tắt trong test MySQL này; broker confirm/retry được kiểm tra riêng bằng unit test. Log nằm trong `target/category-admin-mysql.log`.

Script cũng kiểm tra các API cấu hình mới, lịch sử giá/outbox và lỗi khi chưa kết nối Store. Để chạy thêm Gateway thật chuyển tiếp đến Catalog thật trên database thử nghiệm:

```powershell
mvn -f backend/api-gateway/pom.xml test
python -X utf8 backend/catalog-service/tools/check-category-admin-mysql.py --with-gateway
```

Tùy chọn này cần chạy mvn test của cả Catalog và Gateway trước để có classpath. Nó kiểm tra JWT public/quản trị, ghi variant qua Gateway, trace xuyên hai service, chặn internal và 503 khi Store vắng mặt. Test dùng route HTTP local được cấu hình riêng, không cần Eureka và không thay thế Store bằng service giả. Chưa kiểm thử broker thật hoặc code backend 2.
