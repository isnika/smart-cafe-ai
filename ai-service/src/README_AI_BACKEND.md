# Smart Café AI Backend (3 modules)

This package builds on the supplied `src/` project and connects three endpoints to the CSV mock data:

1. **Recommendation**: TF-IDF content similarity + item-based collaborative filtering + popularity fallback.
2. **Chatbot**: menu-aware responses. If `OPENAI_API_KEY` is configured, it uses an OpenAI-compatible Chat Completions API; without a key, it uses a simple Vietnamese FAQ/menu fallback.
3. **Revenue forecasting**: RandomForestRegressor trained on daily totals from `recommendation/data_mock/orders.csv`, with calendar, lag-1, lag-7 and rolling-7-day features.

## Run from the `ai-service` directory

Install packages if needed:

```powershell
py -m pip install fastapi uvicorn pandas numpy scikit-learn pydantic
```

Start API:

```powershell
py -m uvicorn src.app.main:app --reload
```

Open Swagger at `http://127.0.0.1:8000/docs`.

