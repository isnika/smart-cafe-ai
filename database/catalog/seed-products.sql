-- Local sample menu for testing product search and detail.
-- Run seed-categories.sql first. IDs are resolved by name, never hardcoded.
-- Existing rows are preserved; rerunning inserts only missing sample rows.
SET NAMES utf8mb4;
USE smart_cafe_catalog_db;

START TRANSACTION;

INSERT INTO Products (category_id, name, description, temperature, caffeine_level, flavor_tags, sort_order, status)
SELECT c.id, seed.name, seed.description, seed.temperature, seed.caffeine_level,
       seed.flavor_tags, seed.sort_order, seed.status
FROM (
    SELECT 'Cà phê' AS category_name, 'Latte' AS name, 'Cà phê espresso kết hợp sữa tươi.' AS description,
           'Hot_Or_Iced' AS temperature, 'Medium' AS caffeine_level,
           JSON_ARRAY('creamy', 'sweet') AS flavor_tags, 1 AS sort_order, 'Active' AS status
    UNION ALL SELECT 'Cà phê', 'Americano', 'Espresso pha với nước, vị cà phê đậm.',
           'Hot_Or_Iced', 'High', JSON_ARRAY('bitter'), 2, 'Active'
    UNION ALL SELECT 'Matcha', 'Matcha Latte', 'Matcha kết hợp sữa tươi.',
           'Iced', 'Low', JSON_ARRAY('creamy', 'sweet'), 3, 'Active'
    UNION ALL SELECT 'Trà', 'Trà đào', 'Trà đào thanh mát.',
           'Iced', 'Low', JSON_ARRAY('fruity', 'sweet'), 4, 'Active'
    UNION ALL SELECT 'Cà phê', 'Cà phê ngừng bán (mẫu)', 'Cà phê rang đậm, hương thơm đặc trưng và hậu vị đắng.',
           'Hot', 'High', JSON_ARRAY('bitter'), 99, 'Inactive'
) AS seed
JOIN Categories c ON c.name = seed.category_name
WHERE NOT EXISTS (
    SELECT 1 FROM Products existing WHERE existing.category_id = c.id AND existing.name = seed.name
);

SET @latte_id = (SELECT p.id FROM Products p JOIN Categories c ON c.id = p.category_id WHERE c.name = 'Cà phê' AND p.name = 'Latte' ORDER BY p.id LIMIT 1);
SET @americano_id = (SELECT p.id FROM Products p JOIN Categories c ON c.id = p.category_id WHERE c.name = 'Cà phê' AND p.name = 'Americano' ORDER BY p.id LIMIT 1);
SET @matcha_id = (SELECT p.id FROM Products p JOIN Categories c ON c.id = p.category_id WHERE c.name = 'Matcha' AND p.name = 'Matcha Latte' ORDER BY p.id LIMIT 1);
SET @tea_id = (SELECT p.id FROM Products p JOIN Categories c ON c.id = p.category_id WHERE c.name = 'Trà' AND p.name = 'Trà đào' ORDER BY p.id LIMIT 1);

INSERT INTO Product_Variants (product_id, variant_name, price, sort_order, status)
SELECT seed.product_id, seed.variant_name, seed.price, seed.sort_order, seed.status
FROM (
    SELECT @latte_id AS product_id, 'M' AS variant_name, 40000 AS price, 1 AS sort_order, 'Active' AS status
    UNION ALL SELECT @latte_id, 'L', 50000, 2, 'Active'
    UNION ALL SELECT @latte_id, 'Size cũ (mẫu)', 10000, 99, 'Inactive'
    UNION ALL SELECT @americano_id, 'Standard', 30000, 1, 'Active'
    UNION ALL SELECT @matcha_id, 'M', 45000, 1, 'Active'
    UNION ALL SELECT @matcha_id, 'L', 55000, 2, 'Active'
    UNION ALL SELECT @tea_id, 'Standard', 35000, 1, 'Active'
) AS seed
WHERE seed.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Product_Variants existing
    WHERE existing.product_id = seed.product_id AND existing.variant_name = seed.variant_name
);

INSERT INTO Product_Option_Groups (product_id, name, selection_type, is_required, min_select, max_select, sort_order)
SELECT @latte_id, seed.name, seed.selection_type, seed.is_required, seed.min_select, seed.max_select, seed.sort_order
FROM (
    SELECT 'Mức đường' AS name, 'Single' AS selection_type, TRUE AS is_required, 1 AS min_select, 1 AS max_select, 1 AS sort_order
    UNION ALL SELECT 'Topping', 'Multiple', FALSE, 0, 2, 2
) AS seed
WHERE @latte_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Product_Option_Groups existing WHERE existing.product_id = @latte_id AND existing.name = seed.name
);

SET @sugar_group = (SELECT id FROM Product_Option_Groups WHERE product_id = @latte_id AND name = 'Mức đường' ORDER BY id LIMIT 1);
SET @topping_group = (SELECT id FROM Product_Option_Groups WHERE product_id = @latte_id AND name = 'Topping' ORDER BY id LIMIT 1);

INSERT INTO Product_Options (group_id, option_name, extra_price, is_default, sort_order, status)
SELECT seed.group_id, seed.option_name, seed.extra_price, seed.is_default, seed.sort_order, seed.status
FROM (
    SELECT @sugar_group AS group_id, 'Đường bình thường' AS option_name, 0 AS extra_price, TRUE AS is_default, 1 AS sort_order, 'Active' AS status
    UNION ALL SELECT @sugar_group, 'Ít đường', 0, FALSE, 2, 'Active'
    UNION ALL SELECT @topping_group, 'Trân châu', 5000, FALSE, 1, 'Active'
    UNION ALL SELECT @topping_group, 'Thạch cà phê', 7000, FALSE, 2, 'Active'
    UNION ALL SELECT @topping_group, 'Topping ngừng bán (mẫu)', 1000, FALSE, 99, 'Inactive'
) AS seed
WHERE seed.group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Product_Options existing WHERE existing.group_id = seed.group_id AND existing.option_name = seed.option_name
);

-- Do not invent branch IDs belonging to Store Service (backend 2).
-- Once Store is integrated, use the Catalog availability APIs with a real,
-- verified branch_id. This seed only creates Catalog-owned demonstration data.

COMMIT;
