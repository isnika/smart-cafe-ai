-- ============================================================================
-- Migration: Chuẩn hóa vai trò người dùng về tiền tố ROLE_ và dọn dẹp role trùng lặp
-- ============================================================================
-- Cách chạy nhanh:
-- docker exec -i smartcafe-mysql mysql -uroot -proot < database/migrations/fix_roles.sql
-- ============================================================================

USE smart_cafe_identity_db;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Chuyển người dùng đang gắn role 'Customer' sang 'ROLE_CUSTOMER' (id 6)
UPDATE Users 
SET role_id = (SELECT id FROM Roles WHERE name = 'ROLE_CUSTOMER' LIMIT 1)
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name = 'Customer') AS temp);

-- 2. Chuyển người dùng đang gắn role 'Staff' sang 'ROLE_STAFF' (id 5)
UPDATE Users 
SET role_id = (SELECT id FROM Roles WHERE name = 'ROLE_STAFF' LIMIT 1)
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name = 'Staff') AS temp);

-- 3. Chuyển người dùng đang gắn role 'Manager' sang 'ROLE_MANAGER' (id 2)
UPDATE Users 
SET role_id = (SELECT id FROM Roles WHERE name = 'ROLE_MANAGER' LIMIT 1)
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name = 'Manager') AS temp);

-- 4. Chuyển người dùng đang gắn role 'Admin' sang 'ROLE_ADMIN' (id 1)
UPDATE Users 
SET role_id = (SELECT id FROM Roles WHERE name = 'ROLE_ADMIN' LIMIT 1)
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name = 'Admin') AS temp);

-- 5. Bất kỳ người dùng nào có role không có tiền tố ROLE_ chuyển về ROLE_CUSTOMER
UPDATE Users 
SET role_id = (SELECT id FROM Roles WHERE name = 'ROLE_CUSTOMER' LIMIT 1)
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name NOT LIKE 'ROLE_%') AS temp);

-- 6. Xóa tất cả các role không có tiền tố ROLE_ ra khỏi hệ thống
DELETE FROM Roles WHERE name NOT LIKE 'ROLE_%';

SET FOREIGN_KEY_CHECKS = 1;
