-- Correct only the technical placeholder from the old Catalog sample seed.
-- Keep product status and any description already edited by an administrator.
-- Run once for an existing local sample database; rerunning is safe.
SET NAMES utf8mb4;
USE smart_cafe_catalog_db;

START TRANSACTION;

UPDATE Products p
JOIN Categories c ON c.id = p.category_id
SET p.description = 'Cà phê rang đậm, hương thơm đặc trưng và hậu vị đắng.'
WHERE c.name = 'Cà phê'
  AND p.name = 'Cà phê ngừng bán (mẫu)'
  AND BINARY p.description = BINARY 'Dữ liệu kiểm tra ẩn sản phẩm Inactive.';

SELECT ROW_COUNT() AS updated_sample_products;

COMMIT;
