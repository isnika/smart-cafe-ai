-- Run against smart_cafe_order_db before starting the updated Order service.
-- This is an event projection, not a cross-database foreign key to Identity.
CREATE TABLE IF NOT EXISTS Identity_User_Status (
    user_id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    status_revision BIGINT NOT NULL,
    occurred_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT chk_identity_user_status CHECK (status IN ('Active', 'Banned', 'Deactivated', 'Unverified')),
    CONSTRAINT chk_identity_status_revision CHECK (status_revision > 0)
);
