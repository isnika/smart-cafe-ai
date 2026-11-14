-- Extracted Catalog schema from SmartCoffeeDT.sql. Requires MySQL 8.0.17+.
-- Run once on a fresh catalog database; does not touch another service database.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 02. Catalog Service
-- ============================================================================
-- AVAILABILITY RULE: an item is sellable at a branch only when
--   Products.status = 'Active' AND Product_Variants.status = 'Active'
--   AND (no Branch_Product_Availability row exists OR is_available = TRUE).
-- "No row" means AVAILABLE. Options follow the same rule.
CREATE DATABASE IF NOT EXISTS smart_cafe_catalog_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_cafe_catalog_db;

CREATE TABLE Categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    image VARCHAR(255),
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active'
);

CREATE TABLE Products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    image VARCHAR(255) NULL,
    description TEXT,
    temperature ENUM('Hot', 'Iced', 'Blended', 'Hot_Or_Iced') NULL
        COMMENT 'Serving temperature; NULL for non-drink items (food, merchandise)',
    caffeine_level ENUM('None', 'Low', 'Medium', 'High') NOT NULL DEFAULT 'None',
    flavor_tags JSON NULL COMMENT 'JSON array of lowercase tags, e.g. ["sweet","creamy","nutty"]; used for search and AI recommendations',
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES Categories(id),
    CONSTRAINT chk_products_flavor_tags CHECK (flavor_tags IS NULL OR JSON_TYPE(flavor_tags) = 'ARRAY'),
    INDEX idx_products_category_status (category_id, status, sort_order),
    INDEX idx_products_temperature_caffeine (temperature, caffeine_level),
    INDEX idx_products_flavor_tags ((CAST(flavor_tags -> '$[*]' AS CHAR(30) ARRAY)))
);

CREATE TABLE Product_Variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    variant_name VARCHAR(50) NOT NULL DEFAULT 'Standard',
    price DECIMAL(15,0) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active' COMMENT 'Global menu lifecycle status; branch availability is stored separately',
    CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE RESTRICT,
    CONSTRAINT chk_variants_price CHECK (price >= 0),
    UNIQUE KEY uq_variant_per_product (product_id, variant_name)
);

CREATE TABLE Variant_Price_History (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    variant_id INT NOT NULL,
    old_price DECIMAL(15,0) NULL,
    new_price DECIMAL(15,0) NOT NULL,
    changed_by VARCHAR(36) NULL COMMENT 'External reference to Identity Service',
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_price_history_variant FOREIGN KEY (variant_id) REFERENCES Product_Variants(id) ON DELETE RESTRICT,
    INDEX idx_price_history_variant_time (variant_id, changed_at)
);

CREATE TABLE Branch_Product_Availability (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    branch_id INT NOT NULL COMMENT 'External reference to Store Service; no cross-service FK',
    variant_id INT NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    unavailable_reason VARCHAR(255) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_branch_product_availability_variant FOREIGN KEY (variant_id) REFERENCES Product_Variants(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_branch_variant_availability (branch_id, variant_id),
    INDEX idx_branch_product_availability_branch (branch_id, is_available),
    INDEX idx_branch_product_availability_variant (variant_id)
);

CREATE TABLE Product_Option_Groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    selection_type ENUM('Single', 'Multiple') NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    min_select TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_select TINYINT UNSIGNED NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_option_groups_product FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE RESTRICT,
    CONSTRAINT chk_option_groups_range CHECK (max_select >= 1 AND min_select <= max_select),
    CONSTRAINT chk_option_groups_single CHECK (selection_type <> 'Single' OR max_select = 1),
    CONSTRAINT chk_option_groups_required CHECK (is_required = FALSE OR min_select >= 1),
    UNIQUE KEY uq_option_group_per_product (product_id, name)
);

CREATE TABLE Product_Options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    option_name VARCHAR(100) NOT NULL,
    extra_price DECIMAL(15,0) NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_options_group FOREIGN KEY (group_id) REFERENCES Product_Option_Groups(id) ON DELETE RESTRICT,
    CONSTRAINT chk_options_price CHECK (extra_price >= 0),
    UNIQUE KEY uq_option_per_group (group_id, option_name)
);

CREATE TABLE Branch_Option_Availability (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    branch_id INT NOT NULL COMMENT 'External reference to Store Service; no cross-service FK',
    option_id INT NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    unavailable_reason VARCHAR(255) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_branch_option_availability_option FOREIGN KEY (option_id) REFERENCES Product_Options(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_branch_option_availability (branch_id, option_id),
    INDEX idx_branch_option_availability_branch (branch_id, is_available),
    INDEX idx_branch_option_availability_option (option_id)
);

-- Product-level price for display. The source of truth stays Product_Variants.price
-- (a product can have several sizes with different prices), so there is no duplicate column to drift.
-- Search by flavor: WHERE 'creamy' MEMBER OF (flavor_tags)
CREATE VIEW v_products_full AS
SELECT p.id, p.category_id, p.name, p.image, p.description,
       p.temperature, p.caffeine_level, p.flavor_tags, p.status, p.sort_order,
       MIN(v.price) AS price,
       MAX(v.price) AS max_price
FROM Products p
LEFT JOIN Product_Variants v ON v.product_id = p.id AND v.status = 'Active'
GROUP BY p.id, p.category_id, p.name, p.image, p.description,
         p.temperature, p.caffeine_level, p.flavor_tags, p.status, p.sort_order;

-- Events published: catalog.variant.price_changed, catalog.product.status_changed.
-- Events consumed: inventory.ingredient.low_stock / restocked (update Branch_*_Availability).

CREATE TABLE Outbox_Events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL UNIQUE,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    correlation_id VARCHAR(64) NULL,
    payload JSON NOT NULL,
    status ENUM('Pending', 'Published', 'Failed') NOT NULL DEFAULT 'Pending',
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_retry_at DATETIME NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    INDEX idx_catalog_outbox_dispatch (status, next_retry_at, created_at),
    INDEX idx_catalog_outbox_aggregate (aggregate_type, aggregate_id)
);

CREATE TABLE Processed_Events (
    event_id VARCHAR(36) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(100) NULL,
    processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_catalog_processed_type_time (event_type, processed_at)
);

CREATE TABLE Audit_Logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id VARCHAR(36) NULL COMMENT 'External reference to Identity Service; NULL for system actions',
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_catalog_audit_entity (entity_type, entity_id, created_at),
    INDEX idx_catalog_audit_actor (actor_user_id, created_at)
);
