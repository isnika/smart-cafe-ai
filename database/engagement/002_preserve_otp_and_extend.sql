-- Run after 001_baseline.sql, or against the existing Engagement database.
-- Adds API metadata while preserving OTP rows, event IDs and delivery state.
USE smart_cafe_engagement_db;
DELIMITER $$
DROP PROCEDURE IF EXISTS engagement_add_column$$
CREATE PROCEDURE engagement_add_column(IN table_arg VARCHAR(64), IN column_arg VARCHAR(64), IN definition_arg VARCHAR(500))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = table_arg AND column_name = column_arg) THEN
        SET @engagement_ddl = CONCAT('ALTER TABLE `', table_arg, '` ADD COLUMN `', column_arg, '` ', definition_arg);
        PREPARE engagement_statement FROM @engagement_ddl;
        EXECUTE engagement_statement;
        DEALLOCATE PREPARE engagement_statement;
    END IF;
END$$
DELIMITER ;

CALL engagement_add_column('notifications', 'event_id', 'VARCHAR(36) NULL');
CALL engagement_add_column('notifications', 'recipient', 'VARCHAR(255) NULL');
CALL engagement_add_column('notifications', 'purpose', 'VARCHAR(40) NULL');
CALL engagement_add_column('notifications', 'attempt_count', 'INT NOT NULL DEFAULT 0');
CALL engagement_add_column('notifications', 'last_error', 'VARCHAR(255) NULL');
CALL engagement_add_column('notifications', 'expires_at', 'DATETIME(6) NULL');
CALL engagement_add_column('notifications', 'updated_at', 'DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)');
CALL engagement_add_column('notifications', 'data', 'JSON NULL');
CALL engagement_add_column('voucher_redemptions', 'request_hash', 'VARCHAR(64) NULL');

-- Historical non-OTP rows do not have an event ID; populate only those rows.
UPDATE notifications SET event_id = UUID() WHERE event_id IS NULL;
ALTER TABLE notifications
    MODIFY event_id VARCHAR(36) NOT NULL,
    MODIFY user_id VARCHAR(36) NULL,
    MODIFY recipient VARCHAR(255) NULL,
    MODIFY purpose VARCHAR(40) NULL,
    MODIFY expires_at DATETIME(6) NULL,
    MODIFY status VARCHAR(20) NOT NULL DEFAULT 'Pending';

-- Preserve existing uppercase OTP states. The application reads both casings.
SET @engagement_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE()
           AND table_name = 'notifications' AND column_name = 'event_id' AND non_unique = 0),
    'SELECT 1', 'CREATE UNIQUE INDEX uk_notifications_event_id ON notifications(event_id)');
PREPARE engagement_statement FROM @engagement_ddl;
EXECUTE engagement_statement;
DEALLOCATE PREPARE engagement_statement;
DROP PROCEDURE engagement_add_column;
