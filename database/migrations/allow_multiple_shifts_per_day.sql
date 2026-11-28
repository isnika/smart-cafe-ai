-- Run on the Store database before deploying the updated service.
-- This changes indexes only; it does not delete or modify schedule rows.
-- The supporting index is added first so foreign keys remain indexed.
ALTER TABLE Schedules ADD INDEX idx_schedules_staff_date (staff_id, work_date);
ALTER TABLE Schedules DROP INDEX uq_staff_work_date;
