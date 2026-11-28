-- Apply to the Store database before deploying this version. Existing rows are retained.
ALTER TABLE Schedules
    ADD COLUMN confirmed_at DATETIME NULL,
    MODIFY COLUMN status ENUM('Scheduled', 'Completed', 'Absent', 'Leave', 'Cancelled') NOT NULL DEFAULT 'Scheduled';
