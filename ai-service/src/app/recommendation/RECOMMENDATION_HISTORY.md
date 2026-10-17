# Personalized Recommendation (purchase history)

`POST /api/recommendation` accepts:

```json
{
  "user_id": "U001",
  "top_k": 5
}
```

How it works:

1. Loads the user's historical product interactions from `data_mock/user_item_summary.csv`.
2. Weights each purchased product using quantity, order count, optional rating, and recency (60-day half-life by default).
3. Builds a customer taste profile from product text/features using TF-IDF cosine similarity.
4. Combines that profile with item-item collaborative filtering and overall popularity.
5. Excludes products already purchased from discovery recommendations; this helps surface new products. Popular products are used for new/unknown users.

Optional product-context request:

```json
{
  "product_id": 1,
  "top_k": 5
}
```

Combine both `user_id` and `product_id` to use both the customer's history and the item currently being viewed.

## Important data note

The included CSVs are mock/demo data. For production, replace them with completed, non-cancelled orders from the backend and refresh the recommendation service/model when the catalog or interactions change. `user_id` must match the backend customer ID format consistently. Keep `user_item_summary.csv` aggregated by user and product and ensure product IDs match `products.csv`.

## Run tests

From the `ai-service` directory:

```bash
pytest tests/recommendation/test_personalized_recommendation.py -q
```
