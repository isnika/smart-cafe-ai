-- New database only; includes integration metadata migration 001.
CREATE DATABASE IF NOT EXISTS smart_cafe_order_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_cafe_order_db;

CREATE TABLE Orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_code VARCHAR(20) NOT NULL UNIQUE,
    request_hash VARCHAR(64) NULL,
    request_owner VARCHAR(150) NULL,
    idempotency_key VARCHAR(64) NULL UNIQUE COMMENT 'Prevents duplicate order creation on retry/double-submit',
    user_id VARCHAR(36) NULL COMMENT 'External reference to Identity Service; required for Online orders',
    created_by VARCHAR(36) NULL COMMENT 'External reference to Identity Service; staff user for POS orders',
    branch_id INT NOT NULL COMMENT 'External reference to Store Service',
    table_session_id BIGINT NULL COMMENT 'External reference to Store Service; required for Dine_In',
    order_source ENUM('Online', 'QR', 'POS') NOT NULL,
    fulfillment_type ENUM('Delivery', 'Pickup', 'Dine_In') NOT NULL,
    delivery_name VARCHAR(100) NULL,
    delivery_phone VARCHAR(20) NULL,
    delivery_address VARCHAR(255) NULL,
    delivery_latitude DECIMAL(10,7) NULL,
    delivery_longitude DECIMAL(10,7) NULL,
    sub_total DECIMAL(15,0) NOT NULL COMMENT 'Sum of order item line gross amounts (items + options, before discounts)',
    item_discount_amount DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Sum of Order_Items.discount_amount (e.g. loyalty reward)',
    voucher_code VARCHAR(50) NULL COMMENT 'Snapshot; vouchers are owned by Engagement Service',
    voucher_discount_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(15,0) NOT NULL DEFAULT 0,
    vat_amount DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'VAT portion already included in final_amount',
    final_amount DECIMAL(15,0) NOT NULL,
    status ENUM('Pending_Payment', 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Shipping', 'Served', 'Completed', 'Cancelled', 'Rejected')
        NOT NULL DEFAULT 'Pending',
    payment_status ENUM('Unpaid', 'Paid', 'Partially_Refunded', 'Refunded') NOT NULL DEFAULT 'Unpaid',
    expires_at DATETIME NULL COMMENT 'Deadline for Pending_Payment orders',
    cancel_reason VARCHAR(255) NULL,
    cancelled_by VARCHAR(36) NULL COMMENT 'External reference to Identity Service',
    cancelled_at DATETIME NULL,
    completed_at DATETIME NULL,
    note VARCHAR(255) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Optimistic lock: UPDATE ... WHERE id=? AND version=?',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_orders_amounts CHECK (
        sub_total >= 0 AND item_discount_amount >= 0 AND voucher_discount_amount >= 0
        AND delivery_fee >= 0 AND vat_amount >= 0 AND final_amount >= 0
        AND item_discount_amount + voucher_discount_amount <= sub_total
    ),
    CONSTRAINT chk_orders_final_formula CHECK (
        final_amount = sub_total - item_discount_amount - voucher_discount_amount + delivery_fee
    ),
    CONSTRAINT chk_orders_source_fulfillment CHECK (
        (order_source = 'QR'  AND fulfillment_type = 'Dine_In')
        OR (order_source = 'POS'    AND fulfillment_type IN ('Dine_In', 'Pickup'))
        OR (order_source = 'Online' AND fulfillment_type IN ('Delivery', 'Pickup'))
    ),
    CONSTRAINT chk_orders_table_session CHECK (
        (fulfillment_type = 'Dine_In' AND table_session_id IS NOT NULL)
        OR (fulfillment_type <> 'Dine_In' AND table_session_id IS NULL)
    ),
    CONSTRAINT chk_orders_delivery CHECK (
        (fulfillment_type = 'Delivery' AND delivery_name IS NOT NULL AND delivery_phone IS NOT NULL AND delivery_address IS NOT NULL)
        OR (fulfillment_type <> 'Delivery' AND delivery_fee = 0)
    ),
    CONSTRAINT chk_orders_online_user CHECK (order_source <> 'Online' OR user_id IS NOT NULL),
    CONSTRAINT chk_orders_pos_staff CHECK (order_source <> 'POS' OR created_by IS NOT NULL),
    CONSTRAINT chk_orders_cancel_reason CHECK (status NOT IN ('Cancelled', 'Rejected') OR cancel_reason IS NOT NULL),
    CONSTRAINT chk_orders_completed_at CHECK (status <> 'Completed' OR completed_at IS NOT NULL),
    INDEX idx_orders_user_created (user_id, created_at),
    INDEX idx_orders_branch_status (branch_id, status),
    INDEX idx_orders_branch_created (branch_id, created_at),
    INDEX idx_orders_table_session (table_session_id),
    INDEX idx_orders_status_created (status, created_at),
    INDEX idx_orders_pending_expiry (status, expires_at)
);

-- Option prices live in Order_Item_Options. Per-unit option total is snapshotted here for line_total.
-- Reward rule: the free drink discounts the BASE price only (options are still charged).
CREATE TABLE Order_Items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id INT NOT NULL COMMENT 'External reference to Catalog Service',
    variant_id INT NOT NULL COMMENT 'External reference to Catalog Service',
    product_name VARCHAR(100) NOT NULL COMMENT 'Snapshot at ordering time',
    variant_name VARCHAR(50) NOT NULL COMMENT 'Snapshot at ordering time',
    quantity INT NOT NULL,
    unit_price DECIMAL(15,0) NOT NULL COMMENT 'Snapshot variant price at ordering time',
    options_unit_total DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Snapshot sum of option prices for ONE unit of this item',
    discount_amount DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Total discount applied to this line',
    is_reward_item BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'TRUE only for the free drink redeemed with 10 loyalty stamps',
    line_total DECIMAL(15,0) GENERATED ALWAYS AS (quantity * (unit_price + options_unit_total) - discount_amount) STORED,
    reward_order_id BIGINT GENERATED ALWAYS AS (CASE WHEN is_reward_item THEN order_id ELSE NULL END) STORED
        COMMENT 'Used only to enforce at most one reward item per order',
    note VARCHAR(255),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE RESTRICT,
    CONSTRAINT chk_order_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_order_items_price CHECK (unit_price >= 0 AND options_unit_total >= 0),
    CONSTRAINT chk_order_items_discount CHECK (discount_amount >= 0 AND discount_amount <= unit_price * quantity),
    CONSTRAINT chk_order_items_reward CHECK (is_reward_item = FALSE OR (quantity = 1 AND discount_amount = unit_price)),
    UNIQUE KEY uq_one_reward_item_per_order (reward_order_id),
    INDEX idx_order_items_order (order_id),
    INDEX idx_order_items_variant (variant_id),
    INDEX idx_order_items_product (product_id)
);
-- APP RULE: reward items are only allowed for orders with user_id (members), and must match a Redeem
--           transaction in Engagement. Orders.sub_total / item_discount_amount must equal the sums of the lines.

CREATE TABLE Order_Item_Options (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_item_id BIGINT NOT NULL,
    option_id INT NOT NULL COMMENT 'External reference to Catalog Service',
    option_name VARCHAR(100) NOT NULL COMMENT 'Snapshot at ordering time',
    quantity INT NOT NULL DEFAULT 1 COMMENT 'Count of this option PER ONE unit of the item',
    unit_price DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Snapshot option price',
    CONSTRAINT fk_order_item_options_item FOREIGN KEY (order_item_id) REFERENCES Order_Items(id) ON DELETE RESTRICT,
    CONSTRAINT chk_order_item_options CHECK (quantity > 0 AND unit_price >= 0),
    UNIQUE KEY uq_order_item_option (order_item_id, option_id)
);

CREATE TABLE Order_Status_History (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    from_status VARCHAR(20) NULL,
    status ENUM('Pending_Payment', 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Shipping', 'Served', 'Completed', 'Cancelled', 'Rejected') NOT NULL,
    changed_by VARCHAR(36) NULL COMMENT 'External reference to Identity Service; NULL for system',
    note VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_history_order FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE RESTRICT,
    INDEX idx_order_history_order_time (order_id, created_at)
);

CREATE TABLE Carts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    cart_source ENUM('Online', 'QR') NOT NULL,
    branch_id INT NOT NULL COMMENT 'External reference to Store Service; availability and delivery fee depend on it',
    fulfillment_type ENUM('Delivery', 'Pickup', 'Dine_In') NOT NULL,
    user_id VARCHAR(36) NULL COMMENT 'External reference to Identity Service; required for Online carts',
    table_session_id BIGINT NULL COMMENT 'External reference to Store Service; required for QR carts',
    client_key VARCHAR(64) NULL COMMENT 'Anonymous device key; required for QR carts so guests at one table keep separate carts',
    status ENUM('Active', 'Converted', 'Abandoned') NOT NULL DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    active_online_user_id VARCHAR(36) GENERATED ALWAYS AS (
        CASE WHEN cart_source = 'Online' AND status = 'Active' THEN user_id ELSE NULL END
    ) STORED,
    active_qr_session_id BIGINT GENERATED ALWAYS AS (
        CASE WHEN cart_source = 'QR' AND status = 'Active' THEN table_session_id ELSE NULL END
    ) STORED,
    active_qr_client_key VARCHAR(64) GENERATED ALWAYS AS (
        CASE WHEN cart_source = 'QR' AND status = 'Active' THEN client_key ELSE NULL END
    ) STORED,
    CONSTRAINT chk_carts_shape CHECK (
        (cart_source = 'Online' AND fulfillment_type IN ('Delivery', 'Pickup')
            AND user_id IS NOT NULL AND table_session_id IS NULL AND client_key IS NULL)
        OR
        (cart_source = 'QR' AND fulfillment_type = 'Dine_In'
            AND table_session_id IS NOT NULL AND client_key IS NOT NULL)
    ),
    UNIQUE KEY uq_one_active_online_cart_per_user (active_online_user_id),
    UNIQUE KEY uq_one_active_qr_cart_per_client (active_qr_session_id, active_qr_client_key),
    INDEX idx_carts_user_status (user_id, status),
    INDEX idx_carts_table_session_status (table_session_id, status),
    INDEX idx_carts_branch (branch_id)
);

CREATE TABLE Cart_Items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    cart_id BIGINT NOT NULL,
    variant_id INT NOT NULL COMMENT 'External reference to Catalog Service',
    quantity INT NOT NULL DEFAULT 1,
    note VARCHAR(255) NULL,
    CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES Carts(id) ON DELETE CASCADE,
    CONSTRAINT chk_cart_items_qty CHECK (quantity > 0),
    INDEX idx_cart_items_cart (cart_id),
    INDEX idx_cart_items_variant (variant_id)
);

CREATE TABLE Cart_Item_Options (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    cart_item_id BIGINT NOT NULL,
    option_id INT NOT NULL COMMENT 'External reference to Catalog Service',
    quantity INT NOT NULL DEFAULT 1,
    CONSTRAINT fk_cart_item_options_item FOREIGN KEY (cart_item_id) REFERENCES Cart_Items(id) ON DELETE CASCADE,
    CONSTRAINT chk_cart_item_options_qty CHECK (quantity > 0),
    UNIQUE KEY uq_cart_item_option (cart_item_id, option_id)
);

-- Events published: order.created, order.status_changed, order.completed, order.cancelled.
CREATE TABLE Identity_User_Status (
    user_id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    status_revision BIGINT NOT NULL,
    occurred_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT chk_identity_user_status CHECK (status IN ('Active', 'Banned', 'Deactivated', 'Unverified')),
    CONSTRAINT chk_identity_status_revision CHECK (status_revision > 0)
);

CREATE TABLE Engagement_Checkouts (
    order_id BIGINT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'Pending',
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at DATETIME NOT NULL,
    last_error VARCHAR(100) NULL,
    CONSTRAINT chk_engagement_checkout_status CHECK (status IN ('Pending','Committed','Reversed')),
    INDEX idx_engagement_checkout_recovery (status,next_retry_at)
);

-- Events consumed: payment.succeeded / payment.refunded (-> payment_status), store.table_session.closed.
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
    INDEX idx_order_outbox_dispatch (status, next_retry_at, created_at),
    INDEX idx_order_outbox_aggregate (aggregate_type, aggregate_id)
);

CREATE TABLE Processed_Events (
    event_id VARCHAR(36) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(100) NULL,
    processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_processed_type_time (event_type, processed_at)
);


CREATE TABLE Order_Payment_Entries (
    entry_key VARCHAR(120) PRIMARY KEY COMMENT 'payment:{payment_id}:{order_id} or refund:{refund_id}:{order_id}',
    order_id BIGINT NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount DECIMAL(15,0) NOT NULL,
    CONSTRAINT fk_order_payment_entry_order FOREIGN KEY (order_id) REFERENCES Orders(id),
    CONSTRAINT chk_order_payment_entry_amount CHECK (amount > 0),
    CONSTRAINT chk_order_payment_entry_type CHECK (entry_type IN ('Payment', 'Refund')),
    INDEX idx_order_payment_entry_order (order_id)
);
