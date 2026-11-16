-- ============================================================================
-- SMART CAFE AI - SEED DATA SCRIPT (50 SẢN PHẨM & DỮ LIỆU MẪU ĐẦY ĐỦ)
-- ============================================================================
-- Thực thi trên MySQL 8.0+:
--   docker exec -i smartcafe-mysql mysql -uroot -proot < database/seed_data.sql
-- ============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Làm sạch dữ liệu các bảng trước khi nạp để tránh trùng lặp hoặc lỗi ký tự cũ
TRUNCATE TABLE smart_cafe_catalog_db.Product_Options;
TRUNCATE TABLE smart_cafe_catalog_db.Product_Option_Groups;
TRUNCATE TABLE smart_cafe_catalog_db.Product_Variants;
TRUNCATE TABLE smart_cafe_catalog_db.Products;
TRUNCATE TABLE smart_cafe_catalog_db.Categories;

TRUNCATE TABLE smart_cafe_store_db.Staff_Profiles;
TRUNCATE TABLE smart_cafe_store_db.Tables;
TRUNCATE TABLE smart_cafe_store_db.Branches;

TRUNCATE TABLE smart_cafe_identity_db.Users;
TRUNCATE TABLE smart_cafe_identity_db.Roles;

TRUNCATE TABLE smart_cafe_inventory_db.Inventories;
TRUNCATE TABLE smart_cafe_inventory_db.Ingredients;
TRUNCATE TABLE smart_cafe_inventory_db.Suppliers;

TRUNCATE TABLE smart_cafe_engagement_db.Loyalty_Cards;
TRUNCATE TABLE smart_cafe_engagement_db.Vouchers;

-- ----------------------------------------------------------------------------
-- 1. IDENTITY SERVICE (Roles & Users)
-- ----------------------------------------------------------------------------
USE smart_cafe_identity_db;

INSERT INTO Roles (id, name, description) VALUES
(1, 'ROLE_ADMIN', 'Quản trị viên toàn hệ thống'),
(2, 'ROLE_MANAGER', 'Quản lý chi nhánh cửa hàng'),
(3, 'ROLE_CASHIER', 'Thu ngân quầy thu tiền'),
(4, 'ROLE_BARISTA', 'Nhân viên pha chế quầy Bar'),
(5, 'ROLE_STAFF', 'Nhân viên phục vụ sàn/bàn'),
(6, 'ROLE_CUSTOMER', 'Khách hàng thành viên Smart Cafe')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

-- Mật khẩu mặc định: 123456 (BCrypt: $2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG)
INSERT INTO Users (id, email, phone, password_hash, full_name, role_id, status) VALUES
('usr_admin_001', 'admin@smartcafe.vn', '0901000001', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Nguyễn Quản Trị', 1, 'Active'),
('usr_manager_001', 'manager.q1@smartcafe.vn', '0901000002', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Trần Quản Lý Q1', 2, 'Active'),
('usr_cashier_001', 'cashier.q1@smartcafe.vn', '0901000003', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Lê Thu Ngân', 3, 'Active'),
('usr_barista_001', 'barista.q1@smartcafe.vn', '0901000004', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Phạm Pha Chế', 4, 'Active'),
('usr_staff_001', 'staff_001@smartcafe.vn', '0901000005', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Võ Phục Vụ', 5, 'Active'),
('usr_cust_001', 'nguyenvanan@gmail.com', '0988111222', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Nguyễn Văn An', 6, 'Active'),
('usr_cust_002', 'tranthibinh@gmail.com', '0988333444', '$2a$10$VpiMImOFIQYYzkBLz.AwzO1bkHjE/Lyb5F/XDLCoo964rLqJR06tG', 'Trần Thị Bình', 6, 'Active')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), status=VALUES(status), password_hash=VALUES(password_hash);

-- ----------------------------------------------------------------------------
-- 2. STORE SERVICE (Chi nhánh, Bàn ăn, Nhân sự)
-- ----------------------------------------------------------------------------
USE smart_cafe_store_db;

INSERT INTO Branches (id, code, name, address, phone, timezone, opening_time, closing_time, accepts_online_orders, delivery_radius_km, delivery_fee, status) VALUES
(1, 'BR_Q1', 'Smart Café - Flagship Nguyễn Huệ', '68 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP. HCM', '02838221199', 'Asia/Ho_Chi_Minh', '07:00:00', '23:00:00', TRUE, 10.0, 15000, 'Active'),
(2, 'BR_BT', 'Smart Café - Landmark 81', 'Tầng trệt Landmark 81, 720A Điện Biên Phủ, P. 22, Bình Thạnh, TP. HCM', '02838992288', 'Asia/Ho_Chi_Minh', '07:30:00', '22:30:00', TRUE, 8.0, 18000, 'Active'),
(3, 'BR_HN', 'Smart Café - Phố Cổ Hà Nội', '12 Hàng Bạc, P. Hàng Bạc, Hoàn Kiếm, Hà Nội', '02439263388', 'Asia/Ho_Chi_Minh', '06:30:00', '23:00:00', TRUE, 7.0, 15000, 'Active')
ON DUPLICATE KEY UPDATE name=VALUES(name), address=VALUES(address), status=VALUES(status);

-- 10 bàn tại Chi nhánh 1 (Quận 1)
INSERT INTO Tables (id, branch_id, table_number, qr_code, is_active) VALUES
(1, 1, 'Bàn 01', 'SMARTCAFE_B01_T01', TRUE),
(2, 1, 'Bàn 02', 'SMARTCAFE_B01_T02', TRUE),
(3, 1, 'Bàn 03', 'SMARTCAFE_B01_T03', TRUE),
(4, 1, 'Bàn 04', 'SMARTCAFE_B01_T04', TRUE),
(5, 1, 'Bàn 05', 'SMARTCAFE_B01_T05', TRUE),
(6, 1, 'Bàn 06', 'SMARTCAFE_B01_T06', TRUE),
(7, 1, 'Bàn 07', 'SMARTCAFE_B01_T07', TRUE),
(8, 1, 'Bàn 08', 'SMARTCAFE_B01_T08', TRUE),
(9, 1, 'Bàn 09', 'SMARTCAFE_B01_T09', TRUE),
(10, 1, 'Bàn 10', 'SMARTCAFE_B01_T10', TRUE)
ON DUPLICATE KEY UPDATE table_number=VALUES(table_number), qr_code=VALUES(qr_code);

-- 10 bàn tại Chi nhánh 2 (Landmark 81)
INSERT INTO Tables (id, branch_id, table_number, qr_code, is_active) VALUES
(11, 2, 'Bàn 01', 'SMARTCAFE_B02_T01', TRUE),
(12, 2, 'Bàn 02', 'SMARTCAFE_B02_T02', TRUE),
(13, 2, 'Bàn 03', 'SMARTCAFE_B02_T03', TRUE),
(14, 2, 'Bàn 04', 'SMARTCAFE_B02_T04', TRUE),
(15, 2, 'Bàn 05', 'SMARTCAFE_B02_T05', TRUE),
(16, 2, 'Bàn 06', 'SMARTCAFE_B02_T06', TRUE),
(17, 2, 'Bàn 07', 'SMARTCAFE_B02_T07', TRUE),
(18, 2, 'Bàn 08', 'SMARTCAFE_B02_T08', TRUE),
(19, 2, 'Bàn 09', 'SMARTCAFE_B02_T09', TRUE),
(20, 2, 'Bàn 10', 'SMARTCAFE_B02_T10', TRUE)
ON DUPLICATE KEY UPDATE table_number=VALUES(table_number), qr_code=VALUES(qr_code);

-- Hồ sơ nhân sự liên kết chi nhánh
INSERT INTO Staff_Profiles (id, user_id, branch_id, employee_code, job_title, employment_type, hire_date, status) VALUES
(1, 'usr_manager_001', 1, 'EMP001', 'Store Manager', 'Full_Time', '2025-01-01', 'Active'),
(2, 'usr_cashier_001', 1, 'EMP002', 'Head Cashier', 'Full_Time', '2025-02-01', 'Active'),
(3, 'usr_barista_001', 1, 'EMP003', 'Lead Barista', 'Full_Time', '2025-02-15', 'Active'),
(4, 'usr_staff_001', 1, 'EMP004', 'Server Staff', 'Part_Time', '2025-03-01', 'Active')
ON DUPLICATE KEY UPDATE job_title=VALUES(job_title), status=VALUES(status);

-- ----------------------------------------------------------------------------
-- 3. CATALOG SERVICE (Categories, 50 Sản Phẩm, Variants, Option Groups & Items)
-- ----------------------------------------------------------------------------
USE smart_cafe_catalog_db;

-- 6 Danh mục sản phẩm lớn
INSERT INTO Categories (id, name, image, sort_order, status) VALUES
(1, 'Cà Phê Truyền Thống', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600', 1, 'Active'),
(2, 'Cà Phê Pha Máy', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600', 2, 'Active'),
(3, 'Trà Trái Cây & Trà Sữa', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600', 3, 'Active'),
(4, 'Đá Xay & Sinh Tố', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600', 4, 'Active'),
(5, 'Nước Ép & Detox Tươi', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600', 5, 'Active'),
(6, 'Bánh Ngọt & Đồ Ăn Kèm', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600', 6, 'Active')
ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order);

-- 50 Sản phẩm chi tiết
INSERT INTO Products (id, category_id, name, image, description, temperature, caffeine_level, flavor_tags, sort_order, status) VALUES
-- --- Nhóm 1: Cà Phê Truyền Thống (1 - 8) ---
(1, 1, 'Cà Phê Đen Đá', 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500', 'Cà phê Robusta Đắk Lắk nguyên chất pha phin truyền thống, đậm đà sánh quyện.', 'Iced', 'High', '["đậm đà", "đắng thanh", "truyền thống"]', 1, 'Active'),
(2, 1, 'Cà Phê Sữa Đá', 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500', 'Sự kết hợp hoàn hảo giữa cà phê phin đậm vị và sữa đặc béo ngọt thơm lừng.', 'Iced', 'High', '["ngọt ngào", "béo ngậy", "đậm đà"]', 2, 'Active'),
(3, 1, 'Bạc Xỉu Sài Gòn', 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500', 'Nhiều sữa ít cà phê, béo ngậy sữa tươi kết hợp sữa đặc và lớp bọt cà phê bồng bềnh.', 'Hot_Or_Iced', 'Medium', '["ngọt dịu", "béo ngậy", "dễ uống"]', 3, 'Active'),
(4, 1, 'Cà Phê Muối Xứ Huế', 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=500', 'Vị đắng cà phê hòa quyện cùng lớp kem muối béo mặn đặc trưng khó quên.', 'Iced', 'Medium', '["mặn mà", "béo ngậy", "độc đáo"]', 4, 'Active'),
(5, 1, 'Cà Phê Trứng Hà Nội', 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=500', 'Lớp kem trứng đánh bông mịn vàng óng bên trên cà phê phin nóng hổi, thơm phức không tanh.', 'Hot', 'Medium', '["thơm béo", "ấm áp", "truyền thống"]', 5, 'Active'),
(6, 1, 'Cà Phê Cốt Dừa Đá Xay', 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=500', 'Nước cốt dừa thơm béo xay đá tuyết mịn, rưới lên dòng cà phê đen sánh đặc.', 'Blended', 'Medium', '["thơm dừa", "mát lạnh", "béo ngậy"]', 6, 'Active'),
(7, 1, 'Cà Phê Đen Nóng', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500', 'Từng giọt cà phê phin nhỏ chậm, thơm nồng ấm áp xua tan cái lạnh.', 'Hot', 'High', '["đậm đà", "thơm nồng", "ấm áp"]', 7, 'Active'),
(8, 1, 'Cà Phê Sữa Nóng', 'https://images.unsplash.com/photo-1534040385115-33dcb3acba5b?w=500', 'Cà phê phin nóng hổi hòa tan cùng sữa đặc nguyên kem thơm ngọt ngào.', 'Hot', 'High', '["ấm áp", "ngọt dịu", "đậm đà"]', 8, 'Active'),

-- --- Nhóm 2: Cà Phê Pha Máy & Cold Brew (9 - 17) ---
(9, 2, 'Espresso Đậm Vị', 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=500', 'Chiết xuất từ hạt Arabica Cầu Đất nguyên chất, lớp crema hạt dẻ sánh vàng.', 'Hot', 'High', '["nguyên bản", "đậm đặc", "chua nhẹ"]', 9, 'Active'),
(10, 2, 'Americano Cổ Điển', 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500', 'Espresso pha loãng với nước tinh khiết, thanh nhẹ, giữ trọn hương hoa quả mộc.', 'Hot_Or_Iced', 'Medium', '["thanh nhẹ", "ít đắng", "tỉnh táo"]', 10, 'Active'),
(11, 2, 'Caffe Latte Mịn Màng', 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=500', 'Espresso hòa cùng sữa tươi đánh nóng với lớp micro-foam mỏng mịn như nhung.', 'Hot_Or_Iced', 'Medium', '["mềm mại", "béo sữa", "hương hoa"]', 11, 'Active'),
(12, 2, 'Cappuccino Nghệ Thuật', 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=500', 'Tỷ lệ vàng 1/3 Espresso, 1/3 sữa nóng và 1/3 bọt sữa bồng bềnh phủ bột cacao.', 'Hot', 'Medium', '["bọt sữa dày", "thơm béo", "cân bằng"]', 12, 'Active'),
(13, 2, 'Caramel Macchiato', 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=500', 'Vani ngọt ngào, sữa tươi béo ngậy, espresso đậm đà và vệt sốt caramel óng ả.', 'Hot_Or_Iced', 'Medium', '["ngọt caramel", "thơm vani", "nhiều tầng"]', 13, 'Active'),
(14, 2, 'Mocha Socola Đen', 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=500', 'Sự kết hợp quyến rũ giữa Espresso đậm vị và sốt socola đen nguyên chất thượng hạng.', 'Hot_Or_Iced', 'Medium', '["socola đen", "đậm đà", "hấp dẫn"]', 14, 'Active'),
(15, 2, 'Cold Brew Cam Vàng Sả', 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500', 'Cà phê ủ lạnh 16 tiếng kết hợp nước cam tươi và sả đập dập sảng khoái.', 'Iced', 'Medium', '["chua thanh", "sảng khoái", "ít đắng"]', 15, 'Active'),
(16, 2, 'Cold Brew Vải Hoa Hồng', 'https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=500', 'Cà phê ủ lạnh hòa hương hoa hồng dịu nhẹ và trái vải ngâm mọng nước.', 'Iced', 'Medium', '["thơm hoa", "ngọt dịu", "tươi mới"]', 16, 'Active'),
(17, 2, 'Flat White Chuẩn Úc', 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=500', 'Gấp đôi lượng espresso (Double Ristretto) hòa cùng sữa đánh mịn, đậm đà vị cà phê.', 'Hot', 'High', '["sữa mịn", "đậm cà phê", "mịn màng"]', 17, 'Active'),

-- --- Nhóm 3: Trà Trái Cây & Trà Sữa (18 - 27) ---
(18, 3, 'Trà Đào Cam Sả', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', 'Trà đen hảo hạng pha cùng cam vàng tươi, sả thơm và những lát đào giòn ngọt.', 'Hot_Or_Iced', 'Low', '["chua ngọt", "thơm đào", "giải nhiệt"]', 18, 'Active'),
(19, 3, 'Trà Vải Hoa Lài', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500', 'Trà xanh ướp hoa lài thanh tao kết hợp cùng vị ngọt lịm mọng nước của vải thiều.', 'Iced', 'Low', '["thơm lài", "vải mọng nước", "thanh mát"]', 19, 'Active'),
(20, 3, 'Trà Mãng Cầu Tươi Tây Ninh', 'https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?w=500', 'Trà lài kết hợp thịt mãng cầu xiêm tươi dầm chua ngọt giòn bùi cực cuốn.', 'Iced', 'None', '["chua ngọt", "mãng cầu tươi", "bắt vị"]', 20, 'Active'),
(21, 3, 'Trà Ô Long Sen Vàng', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500', 'Trà Ô Long thượng hạng kết hợp hạt sen Huế bùi bùi và củ năng giòn sần sật.', 'Hot_Or_Iced', 'Low', '["bùi béo", "thanh tao", "giòn sần sật"]', 21, 'Active'),
(22, 3, 'Trà Bưởi Hồng Mật Ong', 'https://images.unsplash.com/photo-1558160074-4d7d8bdf4256?w=500', 'Tép bưởi hồng tươi mọng nước quyện mật ong hoa nhãn và trà lài thơm thanh.', 'Hot_Or_Iced', 'None', '["vitamin c", "ngọt mật ong", "thanh lọc"]', 22, 'Active'),
(23, 3, 'Trà Sữa Ô Long Nướng', 'https://images.unsplash.com/photo-1558857563-b37cfbcf93f9?w=500', 'Trà ô long sấy nướng kỹ mang hương khói đặc trưng hòa quyện sữa tươi béo ngậy.', 'Hot_Or_Iced', 'Medium', '["hương khói", "đậm vị trà", "béo ngậy"]', 23, 'Active'),
(24, 3, 'Trà Sữa Trân Châu Hoàng Gia', 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=500', 'Hồng trà cổ điển nấu cùng sữa bột béo thơm, kèm trân châu đen dai dẻo ngâm đường đen.', 'Hot_Or_Iced', 'Medium', '["truyền thống", "béo ngậy", "trân châu dẻo"]', 24, 'Active'),
(25, 3, 'Trà Lài Kem Cheese Macchiato', 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=500', 'Trà lài thanh mát bên dưới, phủ lớp kem phô mai béo mặn sánh mịn bên trên.', 'Iced', 'Low', '["kem béo", "thơm hoa lài", "dịu êm"]', 25, 'Active'),
(26, 3, 'Matcha Latte Uji Nhật Bản', 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500', 'Bột trà xanh Uji Kyoto nhập khẩu đánh nhuyễn cùng sữa tươi tiệt trùng thơm ngon.', 'Hot_Or_Iced', 'Medium', '["matcha uji", "chát nhẹ", "thơm sữa"]', 26, 'Active'),
(27, 3, 'Trà Hojicha Gạo Rang Sữa Tươi', 'https://images.unsplash.com/photo-1579738897414-a38b7d4041b6?w=500', 'Trà xanh rang nhiệt độ cao thơm mùi gạo nướng, hàm lượng caffeine thấp dễ chịu.', 'Hot_Or_Iced', 'Low', '["hương gạo rang", "thơm khói", "êm dịu"]', 27, 'Active'),

-- --- Nhóm 4: Đá Xay & Sinh Tố (28 - 35) ---
(28, 4, 'Caramel Coffee Freeze Đá Xay', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500', 'Cà phê espresso xay cùng sốt caramel béo ngọt, phủ lớp kem bông tuyết whipping cream.', 'Blended', 'Medium', '["ngọt mát", "caramel béo", "kem tươi"]', 28, 'Active'),
(29, 4, 'Matcha Freeze Đậu Đỏ', 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=500', 'Matcha đá xay mát lạnh, kèm sốt đậu đỏ ngọt bùi và thạch matcha dai ngon.', 'Blended', 'Medium', '["matcha thơm", "đậu đỏ bùi", "mát lạnh"]', 29, 'Active'),
(30, 4, 'Socola Oreo Cookie Đá Xay', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=500', 'Socola đen nguyên chất xay nhuyễn cùng bánh Oreo giòn rụm và kem sữa béo.', 'Blended', 'Low', '["socola đen", "bánh oreo giòn", "ngọt ngào"]', 30, 'Active'),
(31, 4, 'Sinh Tố Bơ Dừa Sáp Cầu Kè', 'https://images.unsplash.com/photo-1546173159-315724a31696?w=500', 'Bơ sáp dẻo thơm xay cùng cốt dừa tươi ngọt béo ngậy, giàu dưỡng chất tốt cho sức khỏe.', 'Blended', 'None', '["béo ngậy", "bơ dẻo", "ngon ngậy"]', 31, 'Active'),
(32, 4, 'Sinh Tố Xoài Chanh Dây', 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500', 'Xoài cát Hòa Lộc chín vàng kết hợp chanh dây tươi chua ngọt đánh thức vị giác.', 'Blended', 'None', '["chua ngọt", "thơm xoài", "giàu vitamin"]', 32, 'Active'),
(33, 4, 'Sinh Tố Việt Quất Sữa Chua', 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=500', 'Quả việt quất tự nhiên xay cùng sữa chua Hy Lạp thơm ngậy, đẹp da giữ dáng.', 'Blended', 'None', '["chua thanh", "sữa chua", "chống oxy hóa"]', 33, 'Active'),
(34, 4, 'Trà Xanh Freeze Thạch Matcha', 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500', 'Trà xanh đá xay đậm vị Nhật Bản, topping thạch giòn mát và kem tươi bồng bềnh.', 'Blended', 'Medium', '["thạch dai", "matcha đậm", "kem whipping"]', 34, 'Active'),
(35, 4, 'Chanh Tuyết Bạc Hà', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500', 'Đá xay chanh tươi mọng nước hòa quyện tinh chất lá bạc hà the mát bừng tỉnh.', 'Blended', 'None', '["the mát", "chua sảng khoái", "giải nhiệt"]', 35, 'Active'),

-- --- Nhóm 5: Nước Ép Tươi & Detox (36 - 42) ---
(36, 5, 'Nước Ép Cam Tươi Sành Mọng', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500', '100% cam sành vắt tươi nguyên chất, không thêm đường hóa học, dồi dào Vitamin C.', 'Iced', 'None', '["vitamin c", "ngọt tự nhiên", "tươi mới"]', 36, 'Active'),
(37, 5, 'Nước Ép Dưa Hấu Bạc Hà', 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=500', 'Dưa hấu đỏ ngọt mát tự nhiên ép lạnh cùng vài lá bạc hà tươi thanh lọc cơ thể.', 'Iced', 'None', '["ngọt mát", "thanh nhiệt", "màu đỏ đẹp"]', 37, 'Active'),
(38, 5, 'Nước Ép Táo Cà Rốt Củ Dền', 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=500', 'Hỗn hợp nước ép củ quả giàu vitamin A và chất chống oxy hóa, hỗ trợ tuần hoàn máu.', 'Iced', 'None', '["thanh lọc", "đẹp da", "tốt cho sức khỏe"]', 38, 'Active'),
(39, 5, 'Nước Ép Cần Tây Táo Xanh Detox', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=500', 'Cần Tây tươi ép cùng táo xanh thơm giòn, thức uống thanh lọc mỡ thừa hiệu quả.', 'Iced', 'None', '["detox", "ít calo", "tươi xanh"]', 39, 'Active'),
(40, 5, 'Nước Ép Thơm Ổi Hồng', 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=500', 'Sự hòa quyện tuyệt vời giữa ổi ruột hồng thơm ngát và vị chua dịu của dứa tươi.', 'Iced', 'None', '["chua thanh", "thơm lừng", "giàu chất xơ"]', 40, 'Active'),
(41, 5, 'Nước Dừa Tươi Hạt Sen', 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=500', 'Nước dừa xiêm Bến Tre ngọt lành kết hợp hạt sen tươi hấp chín mềm bùi ngọt.', 'Iced', 'None', '["ngọt lành", "hạt sen bùi", "tự nhiên"]', 41, 'Active'),
(42, 5, 'Trà Trái Cây Nhiệt Đới Tươi', 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=500', 'Trà hoa quả kết hợp dưa hấu, táo, dứa, cam vàng cắt hạt lựu thơm ngon vui miệng.', 'Iced', 'Low', '["nhiều loại quả", "chua ngọt", "thanh mát"]', 42, 'Active'),

-- --- Nhóm 6: Bánh Ngọt & Đồ Ăn Kèm (43 - 50) ---
(43, 6, 'Bánh Croissant Bơ Pháp Nướng', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', 'Bánh sừng bò ngàn lớp xốp mềm, dậy mùi bơ Isigny Pháp thơm nức khi hâm nóng.', NULL, 'None', '["bơ thơm", "ngàn lớp", "giòn xốp"]', 43, 'Active'),
(44, 6, 'Bánh Tiramisu Ca Cao Ý', 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500', 'Lớp bánh ladyfinger đẫm cà phê rượu rum xen kẽ kem Mascarpone béo ngậy phủ bột cacao.', NULL, 'Low', '["mềm mịn", "cà phê mascarpone", "ngọt ngào"]', 44, 'Active'),
(45, 6, 'Bánh Mì Hoa Cúc Phô Mai', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', 'Bánh mì bơ hoa cúc mềm mịn thơm lừng với nhân phô mai béo ngậy tan chảy.', NULL, 'None', '["bánh mềm", "phô mai béo", "hương hoa cúc"]', 45, 'Active'),
(46, 6, 'Bánh Mousse Chanh Dây', 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=500', 'Bánh mousse phô mai mềm tan trong miệng kết hợp lớp thạch chanh dây chua thanh ngọt dịu.', NULL, 'None', '["chua ngọt", "mousse mịn", "không ngấy"]', 46, 'Active'),
(47, 6, 'Bánh Phô Mai Nướng Basque Burnt', 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500', 'Bánh cheesecake nướng xém cạnh thơm mùi caramen, bên trong mềm mướt béo ngậy.', NULL, 'None', '["cháy xém thơm", "béo ngậy", "mềm tan"]', 47, 'Active'),
(48, 6, 'Bánh Tart Trứng Bồ Đào Nha', 'https://images.unsplash.com/photo-1587241321921-91a834d6d191?w=500', 'Vỏ bánh ngàn lớp giòn rụm ôm trọn lớp nhân trứng sữa nướng mềm mịn béo ngậy.', NULL, 'None', '["vỏ giòn", "nhân trứng sữa", "ấm nóng"]', 48, 'Active'),
(49, 6, 'Bánh Mì Que Pate Hải Phòng', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500', 'Bánh mì que nướng giòn rụm với nhân pate gan béo ngậy và tương ớt chí chương thơm nồng.', NULL, 'None', '["pate thơm", "chí chương cay", "giòn rụm"]', 49, 'Active'),
(50, 6, 'Hạt Điều Rang Muối Bình Phước', 'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=500', 'Hạt điều cùi dừa loại 1 nguyên vỏ lụa rang củi, bùi béo giòn thơm nhâm nhi bên tách cà phê.', NULL, 'None', '["giòn rụm", "bùi béo", "nhâm nhi"]', 50, 'Active')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), temperature=VALUES(temperature), flavor_tags=VALUES(flavor_tags);

-- ----------------------------------------------------------------------------
-- 4. PRODUCT VARIANTS (Giá bán cho từng kích cỡ Size S, M, L hoặc Tiêu chuẩn)
-- ----------------------------------------------------------------------------

-- Tạo biến thể (Size M và Size L cho 42 món đồ uống 1 -> 42)
INSERT INTO Product_Variants (product_id, variant_name, price, sort_order, status) VALUES
-- 1. Cà phê đen đá
(1, 'Size M', 29000, 1, 'Active'), (1, 'Size L', 39000, 2, 'Active'),
-- 2. Cà phê sữa đá
(2, 'Size M', 35000, 1, 'Active'), (2, 'Size L', 45000, 2, 'Active'),
-- 3. Bạc xỉu Sài Gòn
(3, 'Size M', 39000, 1, 'Active'), (3, 'Size L', 49000, 2, 'Active'),
-- 4. Cà phê muối
(4, 'Size M', 42000, 1, 'Active'), (4, 'Size L', 52000, 2, 'Active'),
-- 5. Cà phê trứng
(5, 'Size M', 49000, 1, 'Active'),
-- 6. Cà phê cốt dừa
(6, 'Size M', 49000, 1, 'Active'), (6, 'Size L', 59000, 2, 'Active'),
-- 7. Đen nóng
(7, 'Size M', 29000, 1, 'Active'),
-- 8. Sữa nóng
(8, 'Size M', 35000, 1, 'Active'),
-- 9. Espresso
(9, 'Single', 35000, 1, 'Active'), (9, 'Double', 45000, 2, 'Active'),
-- 10. Americano
(10, 'Size M', 39000, 1, 'Active'), (10, 'Size L', 49000, 2, 'Active'),
-- 11. Caffe Latte
(11, 'Size M', 52000, 1, 'Active'), (11, 'Size L', 62000, 2, 'Active'),
-- 12. Cappuccino
(12, 'Size M', 52000, 1, 'Active'), (12, 'Size L', 62000, 2, 'Active'),
-- 13. Caramel Macchiato
(13, 'Size M', 59000, 1, 'Active'), (13, 'Size L', 69000, 2, 'Active'),
-- 14. Mocha Socola
(14, 'Size M', 59000, 1, 'Active'), (14, 'Size L', 69000, 2, 'Active'),
-- 15. Cold Brew Cam Sả
(15, 'Size M', 55000, 1, 'Active'), (15, 'Size L', 65000, 2, 'Active'),
-- 16. Cold Brew Vải
(16, 'Size M', 55000, 1, 'Active'), (16, 'Size L', 65000, 2, 'Active'),
-- 17. Flat White
(17, 'Size M', 55000, 1, 'Active'),
-- 18. Trà Đào Cam Sả
(18, 'Size M', 45000, 1, 'Active'), (18, 'Size L', 55000, 2, 'Active'),
-- 19. Trà Vải Hoa Lài
(19, 'Size M', 45000, 1, 'Active'), (19, 'Size L', 55000, 2, 'Active'),
-- 20. Trà Mãng Cầu
(20, 'Size M', 49000, 1, 'Active'), (20, 'Size L', 59000, 2, 'Active'),
-- 21. Trà Ô Long Sen Vàng
(21, 'Size M', 49000, 1, 'Active'), (21, 'Size L', 59000, 2, 'Active'),
-- 22. Trà Bưởi Hồng Mật Ong
(22, 'Size M', 49000, 1, 'Active'), (22, 'Size L', 59000, 2, 'Active'),
-- 23. Trà Sữa Ô Long Nướng
(23, 'Size M', 45000, 1, 'Active'), (23, 'Size L', 55000, 2, 'Active'),
-- 24. Trà Sữa Trân Châu Hoàng Gia
(24, 'Size M', 45000, 1, 'Active'), (24, 'Size L', 55000, 2, 'Active'),
-- 25. Trà Lài Kem Cheese
(25, 'Size M', 49000, 1, 'Active'), (25, 'Size L', 59000, 2, 'Active'),
-- 26. Matcha Latte Uji
(26, 'Size M', 55000, 1, 'Active'), (26, 'Size L', 65000, 2, 'Active'),
-- 27. Trà Hojicha Gạo Rang
(27, 'Size M', 52000, 1, 'Active'), (27, 'Size L', 62000, 2, 'Active'),
-- 28. Caramel Coffee Freeze
(28, 'Size M', 59000, 1, 'Active'), (28, 'Size L', 69000, 2, 'Active'),
-- 29. Matcha Freeze Đậu Đỏ
(29, 'Size M', 62000, 1, 'Active'), (29, 'Size L', 72000, 2, 'Active'),
-- 30. Socola Oreo Đá Xay
(30, 'Size M', 59000, 1, 'Active'), (30, 'Size L', 69000, 2, 'Active'),
-- 31. Sinh Tố Bơ Dừa Sáp
(31, 'Size M', 65000, 1, 'Active'), (31, 'Size L', 75000, 2, 'Active'),
-- 32. Sinh Tố Xoài Chanh Dây
(32, 'Size M', 55000, 1, 'Active'), (32, 'Size L', 65000, 2, 'Active'),
-- 33. Sinh Tố Việt Quất
(33, 'Size M', 62000, 1, 'Active'), (33, 'Size L', 72000, 2, 'Active'),
-- 34. Trà Xanh Freeze Thạch
(34, 'Size M', 59000, 1, 'Active'), (34, 'Size L', 69000, 2, 'Active'),
-- 35. Chanh Tuyết Bạc Hà
(35, 'Size M', 45000, 1, 'Active'), (35, 'Size L', 55000, 2, 'Active'),
-- 36. Nước Ép Cam Tươi
(36, 'Size M', 45000, 1, 'Active'), (36, 'Size L', 55000, 2, 'Active'),
-- 37. Nước Ép Dưa Hấu
(37, 'Size M', 42000, 1, 'Active'), (37, 'Size L', 52000, 2, 'Active'),
-- 38. Nước Ép Táo Cà Rốt Củ Dền
(38, 'Size M', 52000, 1, 'Active'), (38, 'Size L', 62000, 2, 'Active'),
-- 39. Nước Ép Cần Tây Táo Xanh
(39, 'Size M', 52000, 1, 'Active'), (39, 'Size L', 62000, 2, 'Active'),
-- 40. Nước Ép Thơm Ổi Hồng
(40, 'Size M', 49000, 1, 'Active'), (40, 'Size L', 59000, 2, 'Active'),
-- 41. Nước Dừa Tươi Hạt Sen
(41, 'Size M', 49000, 1, 'Active'), (41, 'Size L', 59000, 2, 'Active'),
-- 42. Trà Trái Cây Nhiệt Đới
(42, 'Size M', 49000, 1, 'Active'), (42, 'Size L', 59000, 2, 'Active'),

-- Các món bánh ngọt và ăn kèm (43 - 50: biến thể Standard)
(43, 'Tiêu Chuẩn', 38000, 1, 'Active'),
(44, 'Hũ Thủy Tinh', 49000, 1, 'Active'),
(45, 'Phần Tiêu Chuẩn', 42000, 1, 'Active'),
(46, 'Miếng Tam Giác', 45000, 1, 'Active'),
(47, 'Miếng Tam Giác', 55000, 1, 'Active'),
(48, 'Set 2 Bánh', 39000, 1, 'Active'),
(49, 'Phần 3 Chiếc', 35000, 1, 'Active'),
(50, 'Gói 100g', 45000, 1, 'Active')
ON DUPLICATE KEY UPDATE price=VALUES(price), status=VALUES(status);

-- ----------------------------------------------------------------------------
-- 5. OPTION GROUPS & OPTIONS (Tùy chọn Đường, Đá, Topping, Sữa)
-- ----------------------------------------------------------------------------

-- Thêm Nhóm Option cho các món Đồ Uống tiêu biểu (ví dụ món 1, 2, 3, 18, 23, 24)
INSERT INTO Product_Option_Groups (id, product_id, name, selection_type, is_required, min_select, max_select, sort_order) VALUES
-- Món 2: Cà Phê Sữa Đá
(1, 2, 'Chọn Mức Đường', 'Single', TRUE, 1, 1, 1),
(2, 2, 'Chọn Mức Đá', 'Single', TRUE, 1, 1, 2),
(3, 2, 'Thêm Topping', 'Multiple', FALSE, 0, 3, 3),

-- Món 18: Trà Đào Cam Sả
(4, 18, 'Chọn Mức Đường', 'Single', TRUE, 1, 1, 1),
(5, 18, 'Chọn Mức Đá', 'Single', TRUE, 1, 1, 2),
(6, 18, 'Topping Yêu Thích', 'Multiple', FALSE, 0, 4, 3),

-- Món 24: Trà Sữa Trân Châu Hoàng Gia
(7, 24, 'Mức Ngọt (Đường)', 'Single', TRUE, 1, 1, 1),
(8, 24, 'Lượng Đá', 'Single', TRUE, 1, 1, 2),
(9, 24, 'Topping Thêm', 'Multiple', FALSE, 0, 5, 3),
(10, 24, 'Tùy Chọn Sữa', 'Single', FALSE, 0, 1, 4)
ON DUPLICATE KEY UPDATE name=VALUES(name), selection_type=VALUES(selection_type);

-- Chi tiết từng Option
INSERT INTO Product_Options (id, group_id, option_name, extra_price, is_default, sort_order, status) VALUES
-- Nhóm 1: Mức đường món 2
(1, 1, '100% Đường (Chuẩn)', 0, TRUE, 1, 'Active'),
(2, 1, '70% Đường', 0, FALSE, 2, 'Active'),
(3, 1, '50% Đường', 0, FALSE, 3, 'Active'),
(4, 1, 'Không Đường', 0, FALSE, 4, 'Active'),

-- Nhóm 2: Mức đá món 2
(5, 2, '100% Đá (Chuẩn)', 0, TRUE, 1, 'Active'),
(6, 2, '70% Đá', 0, FALSE, 2, 'Active'),
(7, 2, '50% Đá', 0, FALSE, 3, 'Active'),
(8, 2, 'Không Đá', 0, FALSE, 4, 'Active'),

-- Nhóm 3: Topping món 2
(9, 3, 'Thạch Cà Phê', 8000, FALSE, 1, 'Active'),
(10, 3, 'Kem Cheese Mặn', 12000, FALSE, 2, 'Active'),

-- Nhóm 4 & 5: Đường & Đá món 18
(11, 4, '100% Đường (Chuẩn)', 0, TRUE, 1, 'Active'),
(12, 4, '70% Đường', 0, FALSE, 2, 'Active'),
(13, 4, '50% Đường', 0, FALSE, 3, 'Active'),
(14, 5, '100% Đá (Chuẩn)', 0, TRUE, 1, 'Active'),
(15, 5, '70% Đá', 0, FALSE, 2, 'Active'),
(16, 5, 'Không Đá', 0, FALSE, 3, 'Active'),

-- Nhóm 6: Topping món 18
(17, 6, 'Đào Ngâm Giòn Thêm (3 Miếng)', 10000, FALSE, 1, 'Active'),
(18, 6, 'Hạt Sen Huế Thơm Bùi', 10000, FALSE, 2, 'Active'),
(19, 6, 'Trân Châu Trắng 3Q', 8000, FALSE, 3, 'Active'),

-- Nhóm 7 & 8: Đường & Đá món 24
(20, 7, '100% Đường (Chuẩn)', 0, TRUE, 1, 'Active'),
(21, 7, '70% Đường', 0, FALSE, 2, 'Active'),
(22, 7, '50% Đường', 0, FALSE, 3, 'Active'),
(23, 7, '30% Đường', 0, FALSE, 4, 'Active'),
(24, 8, '100% Đá (Chuẩn)', 0, TRUE, 1, 'Active'),
(25, 8, '70% Đá', 0, FALSE, 2, 'Active'),
(26, 8, '50% Đá', 0, FALSE, 3, 'Active'),
(27, 8, 'Đá Riêng', 0, FALSE, 4, 'Active'),

-- Nhóm 9: Topping món 24
(28, 9, 'Trân Châu Hoàng Gia Thêm', 8000, FALSE, 1, 'Active'),
(29, 9, 'Trân Châu Trắng Giòn', 8000, FALSE, 2, 'Active'),
(30, 9, 'Pudding Trứng Béo Mịn', 10000, FALSE, 3, 'Active'),
(31, 9, 'Kem Macchiato Phô Mai', 12000, FALSE, 4, 'Active'),

-- Nhóm 10: Sữa món 24
(32, 10, 'Sữa Tươi Tiệt Trùng', 0, TRUE, 1, 'Active'),
(33, 10, 'Đổi Sữa Yến Mạch Oatly (Thuần Chay)', 12000, FALSE, 2, 'Active')
ON DUPLICATE KEY UPDATE option_name=VALUES(option_name), extra_price=VALUES(extra_price), is_default=VALUES(is_default);

-- ----------------------------------------------------------------------------
-- 6. INVENTORY SERVICE (Nguyên vật liệu & Nhà cung cấp)
-- ----------------------------------------------------------------------------
USE smart_cafe_inventory_db;

INSERT INTO Suppliers (id, name, phone, email, tax_code, address, status) VALUES
(1, 'Công ty TNHH Cà Phê Tây Nguyên', '0903112233', 'sales@taynguyencoffee.vn', '0312998877', 'Thành phố Buôn Ma Thuột, Đắk Lắk', 'Active'),
(2, 'Công ty Cổ phần Sữa Việt Nam (Vinamilk)', '02854155555', 'vinamilk@vinamilk.com.vn', '0300588569', 'Số 10 Tân Trào, P. Tân Phú, Quận 7, TP. HCM', 'Active'),
(3, 'Trang trại Nông sản Đà Lạt Gap', '02633822999', 'contact@dalatgap.com', '5800456789', 'Thành phố Đà Lạt, Lâm Đồng', 'Active')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO Ingredients (id, name, unit, is_active) VALUES
(1, 'Hạt Cà Phê Robusta Buôn Ma Thuột', 'g', TRUE),
(2, 'Hạt Cà Phê Arabica Cầu Đất', 'g', TRUE),
(3, 'Sữa Đặc Có Đường Ông Thọ', 'ml', TRUE),
(4, 'Sữa Tươi Tiệt Trùng Nguyên Kem', 'ml', TRUE),
(5, 'Trà Đen Thượng Hạng', 'g', TRUE),
(6, 'Trà Ô Long Cao Cấp', 'g', TRUE),
(7, 'Trà Xanh Ướp Hoa Lài', 'g', TRUE),
(8, 'Bột Trà Xanh Matcha Uji', 'g', TRUE),
(9, 'Đường Mía Tinh Luyện', 'g', TRUE),
(10, 'Bột Sữa Béo Pha Chế', 'g', TRUE),
(11, 'Trân Châu Đen Hoàng Gia', 'g', TRUE),
(12, 'Đào Ngâm Miếng Đóng Hộp', 'g', TRUE),
(13, 'Hạt Sen Tươi', 'g', TRUE),
(14, 'Nước Cốt Dừa Tươi Bến Tre', 'ml', TRUE),
(15, 'Sốt Caramel Davinci', 'ml', TRUE),
(16, 'Sốt Socola Đen Hershey', 'ml', TRUE)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Tồn kho ban đầu tại Chi nhánh 1 (Quận 1)
INSERT INTO Inventories (branch_id, ingredient_id, quantity_in_stock, reserved_quantity, reorder_level, average_cost) VALUES
(1, 1, 50000.000, 0, 10000.000, 0.2500),
(1, 2, 30000.000, 0, 5000.000, 0.4500),
(1, 3, 40000.000, 0, 8000.000, 0.0800),
(1, 4, 100000.000, 0, 20000.000, 0.0350),
(1, 5, 20000.000, 0, 4000.000, 0.3000),
(1, 6, 20000.000, 0, 4000.000, 0.4000),
(1, 7, 20000.000, 0, 4000.000, 0.3500),
(1, 8, 5000.000, 0, 1000.000, 1.2000),
(1, 9, 80000.000, 0, 15000.000, 0.0250),
(1, 10, 50000.000, 0, 10000.000, 0.1200),
(1, 11, 30000.000, 0, 5000.000, 0.0600),
(1, 12, 25000.000, 0, 5000.000, 0.0900)
ON DUPLICATE KEY UPDATE quantity_in_stock=VALUES(quantity_in_stock);

-- ----------------------------------------------------------------------------
-- 7. ENGAGEMENT SERVICE (Hạng thẻ thành viên & Voucher khuyến mãi)
-- ----------------------------------------------------------------------------
USE smart_cafe_engagement_db;

INSERT INTO Loyalty_Cards (user_id, current_stamps, lifetime_stamps_earned, total_redeemed_cups) VALUES
('usr_cust_001', 5, 15, 1),
('usr_cust_002', 2, 8, 0)
ON DUPLICATE KEY UPDATE current_stamps=VALUES(current_stamps);

INSERT INTO Vouchers (code, name, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit_total, usage_limit_per_user, starts_at, ends_at, status) VALUES
('CHAOBANMOI', 'Giảm 20.000đ cho đơn đầu tiên', 'Fixed', 20000, 50000, 20000, 10000, 1, '2025-01-01 00:00:00', '2027-12-31 23:59:59', 'Active'),
('SMARTCAFE10', 'Giảm 10% tổng hóa đơn', 'Percent', 10, 80000, 30000, 5000, 3, '2025-01-01 00:00:00', '2027-12-31 23:59:59', 'Active'),
('FREESHIP', 'Miễn phí giao hàng tận nơi', 'Fixed', 20000, 100000, 20000, 5000, 2, '2025-01-01 00:00:00', '2027-12-31 23:59:59', 'Active'),
('COFFEELOVER', 'Giảm 30K cho tín đồ mê cà phê', 'Fixed', 30000, 120000, 30000, 2000, 1, '2025-01-01 00:00:00', '2027-12-31 23:59:59', 'Active')
ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- HOÀN TẤT NẠP DỮ LIỆU SEED MẪU!
-- ============================================================================
