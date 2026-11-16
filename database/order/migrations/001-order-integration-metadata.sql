-- Run once on an existing database created from SmartCoffeeDT.sql.
USE smart_cafe_order_db;
ALTER TABLE Orders
    ADD COLUMN request_hash VARCHAR(64) NULL COMMENT 'SHA-256 of canonical create request',
    ADD COLUMN request_owner VARCHAR(150) NULL COMMENT 'Authenticated owner/capability hash for idempotency replay';

-- Local read-model only: Payment remains the owner of payments and refunds.
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
