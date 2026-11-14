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
SET role_id = 6 
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name = 'Customer') AS temp);

-- 2. Chuyển người dùng đang gắn role 'Staff' sang 'ROLE_STAFF' (id 5)
UPDATE Users 
SET role_id = 5 
WHERE role_id IN (SELECT id FROM (SELECT id FROM Roles WHERE name = 'Staff') AS temp);

-- 3. Xóa các role trùng lặp không có tiền tố ROLE_
DELETE FROM Roles WHERE name IN ('Customer', 'Staff');

SET FOREIGN_KEY_CHECKS = 1;
