-- Engagement baseline, MySQL 8.0+. No existing tables or data are deleted.
CREATE DATABASE IF NOT EXISTS smart_cafe_engagement_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_cafe_engagement_db;

CREATE TABLE IF NOT EXISTS loyalty_cards (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE COMMENT 'External reference to Identity Service',
    current_stamps INT NOT NULL DEFAULT 0,
    lifetime_stamps_earned INT UNSIGNED NOT NULL DEFAULT 0,
    total_redeemed_cups INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Lifetime number of free drinks redeemed',
    version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Optimistic lock',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_loyalty_cards_stamps CHECK (current_stamps >= -100)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(64) NULL UNIQUE COMMENT 'Prevents duplicate command/retry processing',
    user_id VARCHAR(36) NOT NULL COMMENT 'External reference to Identity Service',
    order_id BIGINT NULL COMMENT 'External reference to Order Service',
    transaction_type ENUM('Earn', 'Redeem', 'Reversal', 'Adjustment') NOT NULL,
    stamps INT NOT NULL COMMENT 'Signed delta. Earn > 0; Redeem = -10; Reversal opposes the original',
    balance_after INT NOT NULL,
    reversal_of_id BIGINT NULL COMMENT 'The Earn/Redeem transaction being reversed',
    note VARCHAR(255) NULL,
    created_by VARCHAR(36) NULL COMMENT 'External reference to Identity Service; required for manual Adjustment',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    earn_order_id BIGINT GENERATED ALWAYS AS (CASE WHEN transaction_type = 'Earn' THEN order_id ELSE NULL END) STORED,
    redeem_order_id BIGINT GENERATED ALWAYS AS (CASE WHEN transaction_type = 'Redeem' THEN order_id ELSE NULL END) STORED,
    CONSTRAINT fk_loyalty_tx_reversal FOREIGN KEY (reversal_of_id) REFERENCES loyalty_transactions(id) ON DELETE RESTRICT,
    CONSTRAINT chk_loyalty_tx_shape CHECK (
        (transaction_type = 'Earn' AND order_id IS NOT NULL AND stamps BETWEEN 1 AND 50 AND reversal_of_id IS NULL)
        OR (transaction_type = 'Redeem' AND order_id IS NOT NULL AND stamps = -10 AND reversal_of_id IS NULL)
        OR (transaction_type = 'Reversal' AND reversal_of_id IS NOT NULL AND stamps <> 0)
        OR (transaction_type = 'Adjustment' AND stamps <> 0 AND created_by IS NOT NULL AND note IS NOT NULL)
    ),
    UNIQUE KEY uq_one_loyalty_earn_per_order (earn_order_id),
    UNIQUE KEY uq_one_loyalty_redeem_per_order (redeem_order_id),
    UNIQUE KEY uq_one_reversal_per_transaction (reversal_of_id),
    INDEX idx_loyalty_tx_user_time (user_id, created_at),
    INDEX idx_loyalty_tx_order (order_id),
    INDEX idx_loyalty_tx_type_time (transaction_type, created_at)
);

CREATE TABLE IF NOT EXISTS vouchers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    discount_type ENUM('Percent', 'Fixed') NOT NULL,
    discount_value DECIMAL(15,0) NOT NULL COMMENT 'Percent: 1-100; Fixed: VND',
    max_discount_amount DECIMAL(15,0) NULL COMMENT 'Cap for Percent vouchers',
    min_order_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
    branch_id INT NULL COMMENT 'External reference to Store Service; NULL = all branches',
    applicable_fulfillment ENUM('All', 'Delivery', 'Pickup', 'Dine_In') NOT NULL DEFAULT 'All',
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    usage_limit_total INT UNSIGNED NULL COMMENT 'NULL = unlimited',
    usage_limit_per_user INT UNSIGNED NOT NULL DEFAULT 1,
    used_count INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_vouchers_value CHECK (
        (discount_type = 'Percent' AND discount_value BETWEEN 1 AND 100)
        OR (discount_type = 'Fixed' AND discount_value > 0)
    ),
    CONSTRAINT chk_vouchers_period CHECK (ends_at > starts_at),
    CONSTRAINT chk_vouchers_limits CHECK (
        min_order_amount >= 0 AND usage_limit_per_user >= 1
        AND (usage_limit_total IS NULL OR used_count <= usage_limit_total)
    ),
    INDEX idx_vouchers_active (status, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    voucher_id BIGINT NOT NULL,
    user_id VARCHAR(36) NOT NULL COMMENT 'External reference to Identity Service',
    order_id BIGINT NOT NULL COMMENT 'External reference to Order Service',
    discount_amount DECIMAL(15,0) NOT NULL,
    status ENUM('Applied', 'Reversed') NOT NULL DEFAULT 'Applied',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_voucher_redemptions_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE RESTRICT,
    CONSTRAINT chk_voucher_redemptions_amount CHECK (discount_amount > 0),
    UNIQUE KEY uq_voucher_order (voucher_id, order_id),
    INDEX idx_voucher_redemptions_user (voucher_id, user_id, status)
);

-- Local read-model filled from the order.completed event. It is what makes a review verifiable
-- without cross-service queries and guarantees product_id matches the purchased order item.
CREATE TABLE IF NOT EXISTS verified_purchases (
    order_item_id BIGINT PRIMARY KEY COMMENT 'External reference to Order Service',
    order_id BIGINT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    product_id INT NOT NULL,
    branch_id INT NOT NULL,
    purchased_at DATETIME NOT NULL,
    UNIQUE KEY uq_verified_purchase_identity (order_item_id, user_id, product_id),
    INDEX idx_verified_purchases_user (user_id, purchased_at)
);

CREATE TABLE IF NOT EXISTS product_reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL COMMENT 'External reference to Catalog Service',
    user_id VARCHAR(36) NOT NULL COMMENT 'External reference to Identity Service',
    order_item_id BIGINT NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment TEXT,
    status ENUM('Pending', 'Approved', 'Hidden') NOT NULL DEFAULT 'Pending',
    moderated_by VARCHAR(36) NULL COMMENT 'External reference to Identity Service',
    moderated_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_verified_purchase FOREIGN KEY (order_item_id, user_id, product_id)
        REFERENCES verified_purchases(order_item_id, user_id, product_id) ON DELETE RESTRICT,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    UNIQUE KEY uq_review_order_item_user (order_item_id, user_id),
    INDEX idx_reviews_product_status (product_id, status),
    INDEX idx_reviews_user (user_id)
);

CREATE TABLE IF NOT EXISTS device_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL COMMENT 'External reference to Identity Service',
    platform ENUM('iOS', 'Android', 'Web') NOT NULL,
    token VARCHAR(512) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NULL,
    UNIQUE KEY uq_device_token (platform, token(255)),
    INDEX idx_device_tokens_user (user_id, is_active)
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL COMMENT 'External reference to Identity Service',
    type VARCHAR(50) NOT NULL COMMENT 'order_status, promotion, loyalty...',
    channel ENUM('Push', 'Email', 'SMS', 'In_App') NOT NULL,
    title VARCHAR(150) NOT NULL,
    body VARCHAR(500) NOT NULL,
    data JSON NULL,
    status ENUM('Pending', 'Sent', 'Failed') NOT NULL DEFAULT 'Pending',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user (user_id, is_read, created_at),
    INDEX idx_notifications_status (status, created_at)
);

-- Events published: engagement.loyalty.earned / redeemed / reversed, engagement.review.created.
-- Events consumed: order.completed (earn stamps + verified_purchases), order.cancelled / payment.refunded (reverse),
--                  order.status_changed (notifications).
CREATE TABLE IF NOT EXISTS outbox_events (
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
    INDEX idx_engagement_outbox_dispatch (status, next_retry_at, created_at),
    INDEX idx_engagement_outbox_aggregate (aggregate_type, aggregate_id)
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(36) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(100) NULL,
    processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_engagement_processed_type_time (event_type, processed_at)
);
