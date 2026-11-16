-- Durable compensation ledger, intentionally without a foreign key to Orders.
CREATE TABLE IF NOT EXISTS Engagement_Checkouts (
    order_id BIGINT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'Pending',
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at DATETIME NOT NULL,
    last_error VARCHAR(100) NULL,
    CONSTRAINT chk_engagement_checkout_status CHECK (status IN ('Pending','Committed','Reversed')),
    INDEX idx_engagement_checkout_recovery (status,next_retry_at)
);
