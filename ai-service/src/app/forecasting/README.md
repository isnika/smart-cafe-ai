# Smart Café Forecasting (mock-data edition)

## Included
- `data_mock/orders.csv`: synthetic order-level data, columns mapped from `Orders` (`created_at`, `branch_id`, `status`, `payment_status`, `final_amount` concept) into forecast-friendly fields.
- `data_mock/order_items.csv`: synthetic product demand derived from `Order_Items` columns.
- `data_mock/inventory.csv`: mock of `Inventories` (`quantity_in_stock`, `reserved_quantity`, `reorder_level`).
- `data_mock/recipes.csv`: mock of `Recipes` (`quantity_required`) linked to product and ingredient IDs.
- `service.py`: compares RandomForest, ExtraTrees, HistGradientBoosting using chronological 80/20 validation and selects the lowest MAE. Uses only lagged/rolling features available before the target date.

## Endpoints
Run from `ai-service` root:
```powershell
python -m pip install -r requirements.txt
uvicorn src.app.main:app --reload
```
- `POST /api/forecasting` body `{"start_date":"2026-10-19","days":1}`
- `POST /api/forecasting/products` body `{"target_date":"2026-10-19"}`
- `POST /api/forecasting/inventory` body `{"target_date":"2026-10-19"}`

Revenue output includes chosen model, chronological holdout MAE and scores for each candidate. Product demand is a transparent recent 8-week weekday-average baseline; inventory usage is forecast product quantity multiplied by `Recipes.quantity_required`, compared with available stock (`quantity_in_stock - reserved_quantity`) and `reorder_level`.

## Important limitations
All files in `data_mock` are **synthetic**, not extracted from the user's live MySQL database. They are for wiring and end-to-end testing only, not evidence of real-world accuracy. Before production, replace with actual data and ensure revenue definition is consistent (recommended: completed orders, `Orders.final_amount`, and business-local date based on `Branches.timezone`). Avoid double-counting order items and payments: `Orders.final_amount` is the sales target; successful payments/refunds can be used for reconciliation, not summed on top of order revenue. Ingredient recipe IDs must map to catalog variant IDs and inventory ingredient IDs in the live services.
