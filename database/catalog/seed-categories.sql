-- Sample categories for local Catalog API testing.
-- Run manually against smart_cafe_catalog_db. Existing categories are preserved.
SET NAMES utf8mb4;
USE smart_cafe_catalog_db;

START TRANSACTION;

INSERT INTO Categories (name, image, sort_order, status)
SELECT seed.name, NULL, seed.sort_order, 'Active'
FROM (
    SELECT 'Cà phê' AS name, 1 AS sort_order
    UNION ALL SELECT 'Trà', 2
    UNION ALL SELECT 'Trà sữa', 3
    UNION ALL SELECT 'Matcha', 4
    UNION ALL SELECT 'Đá xay', 5
    UNION ALL SELECT 'Bánh ngọt', 6
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM Categories existing WHERE existing.name = seed.name
);

COMMIT;
