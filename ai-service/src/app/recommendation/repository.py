from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


class RecommendationRepository:
    """Read-only data access for recommendation.

    This uses SQLAlchemy Core so it can be plugged into an existing FastAPI
    infrastructure without requiring project-specific ORM models.
    """

    def __init__(self, engine: Engine):
        self.engine = engine

    def get_products(self):
        sql = text("""
            SELECT
                p.id AS product_id,
                p.name,
                c.name AS category,
                COALESCE(p.description, '') AS description
            FROM Products p
            INNER JOIN Categories c ON c.id = p.category_id
            WHERE p.id IS NOT NULL
            ORDER BY p.id
        """)
        with self.engine.connect() as conn:
            return [dict(row._mapping) for row in conn.execute(sql)]

    def get_purchase_interactions(self):
        """Return user-product interactions from non-cancelled completed orders."""
        sql = text("""
            SELECT
                o.user_id,
                pv.product_id,
                SUM(oi.quantity) AS interaction
            FROM Orders o
            INNER JOIN Order_Items oi ON oi.order_id = o.id
            INNER JOIN Product_Variants pv ON pv.id = oi.variant_id
            WHERE o.user_id IS NOT NULL
              AND o.status IN ('Completed', 'Served')
            GROUP BY o.user_id, pv.product_id
        """)
        with self.engine.connect() as conn:
            return [dict(row._mapping) for row in conn.execute(sql)]

    def get_user_interactions(self, user_id: str):
        sql = text("""
            SELECT
                pv.product_id,
                SUM(oi.quantity) AS interaction
            FROM Orders o
            INNER JOIN Order_Items oi ON oi.order_id = o.id
            INNER JOIN Product_Variants pv ON pv.id = oi.variant_id
            WHERE o.user_id = :user_id
              AND o.status IN ('Completed', 'Served')
            GROUP BY pv.product_id
        """)
        with self.engine.connect() as conn:
            return [dict(row._mapping) for row in conn.execute(sql, {"user_id": user_id})]

    def get_popular_products(self, limit: int = 50):
        sql = text("""
            SELECT
                pv.product_id,
                SUM(oi.quantity) AS purchase_count
            FROM Orders o
            INNER JOIN Order_Items oi ON oi.order_id = o.id
            INNER JOIN Product_Variants pv ON pv.id = oi.variant_id
            WHERE o.status IN ('Completed', 'Served')
            GROUP BY pv.product_id
            ORDER BY purchase_count DESC
            LIMIT :limit
        """)
        with self.engine.connect() as conn:
            return [dict(row._mapping) for row in conn.execute(sql, {"limit": limit})]
    def save_recommendations(self, user_id: str, recommendations: list[dict]) -> None:
        """Persist recommendation impressions for later click/purchase analysis."""
        if not recommendations:
            return

        sql = text("""
            INSERT INTO AI_Recommendations
                (user_id, product_id, recommendation_type, confidence_score, reason)
            VALUES
                (:user_id, :product_id, :recommendation_type, :confidence_score, :reason)
        """)

        params = [
            {
                "user_id": user_id,
                "product_id": int(item["product_id"]),
                "recommendation_type": item["recommendation_type"],
                "confidence_score": max(0.0, min(1.0, float(item["score"]))),
                "reason": item["reason"],
            }
            for item in recommendations
        ]

        with self.engine.begin() as conn:
            conn.execute(sql, params)

