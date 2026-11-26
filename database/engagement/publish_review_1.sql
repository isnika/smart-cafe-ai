-- One-time recovery of review 1 for product 1, left Pending by the old service.
-- Run against smart_cafe_engagement_db only after reviewing the target.
-- Row locking and the status predicate make repeat execution harmless.
USE smart_cafe_engagement_db;
START TRANSACTION;
SELECT id FROM Product_Reviews WHERE id = 1 AND product_id = 1 AND status = 'Pending' FOR UPDATE;
SET @review_event_id = UUID();
SET @review_occurred_at = DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%dT%H:%i:%s.%fZ');
INSERT INTO Outbox_Events (event_id, aggregate_type, aggregate_id, event_type, event_version, payload, status, retry_count, created_at)
SELECT @review_event_id, 'ProductReview', CAST(r.id AS CHAR), 'engagement.review.created', 1,
       JSON_OBJECT('review_id', r.id, 'product_id', r.product_id, 'user_id', r.user_id,
                   'rating', r.rating, 'status', 'Approved', 'event_id', @review_event_id,
                   'event_type', 'engagement.review.created', 'event_version', 1, 'occurred_at', @review_occurred_at),
       'Pending', 0, UTC_TIMESTAMP()
FROM Product_Reviews r
WHERE r.id = 1 AND r.product_id = 1 AND r.status = 'Pending'
  AND NOT EXISTS (SELECT 1 FROM Outbox_Events e WHERE e.aggregate_type = 'ProductReview'
                  AND BINARY e.aggregate_id = BINARY CAST(r.id AS CHAR) AND e.event_type = 'engagement.review.created');
UPDATE Product_Reviews SET status = 'Approved' WHERE id = 1 AND product_id = 1 AND status = 'Pending';
COMMIT;
