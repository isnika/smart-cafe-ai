# smart-cafe-ai
Course project: Smart cafe management and sales system integrated with AI for intelligent recommendations, chatbot assistance, and inventory management.

## Chạy toàn bộ stack bằng Docker

Compose ở thư mục gốc chạy FE chính, Spring backend, AI service và PostgreSQL.
FE thử nghiệm trong `ai-service/frontend-test-chatbot` không thuộc stack này.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Các địa chỉ local:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- AI service (debug): `http://localhost:8001`
- PostgreSQL: `localhost:5432`

Trong container, backend gọi AI bằng `http://ai-service:8000` và database bằng
`db:5432`. Trong trình duyệt, frontend phải gọi backend qua
`http://localhost:8080`.
