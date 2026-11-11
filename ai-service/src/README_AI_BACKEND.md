# Smart Café AI Backend (3 modules)

This package builds on the supplied `src/` project and connects three endpoints to the CSV mock data:

1. **Recommendation**: TF-IDF content similarity + item-based collaborative filtering + popularity fallback.
2. **Chatbot**: menu-aware RAG responses. The service calls the configured
   OpenAI-compatible Chat Completions endpoint (`LLM_PROVIDER`, `LLM_BASE_URL`,
   `LLM_MODEL`); the default local setup targets Ollama at
   `http://localhost:11434/v1` with `qwen2.5:3b`. If the provider is unavailable,
   grounded extractive fallback remains available.
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

