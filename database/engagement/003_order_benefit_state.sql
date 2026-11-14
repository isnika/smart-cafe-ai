-- Additive migration; preserves OTP, vouchers and loyalty data.
CREATE TABLE IF NOT EXISTS order_benefit_state (
    order_id BIGINT PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'Active',
    CONSTRAINT chk_benefit_state CHECK (status IN ('Active','Completed','Reversed'))
);
