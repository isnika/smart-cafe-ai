# Smart Cafe AI - Backend

Backend is organized as independent Spring Boot microservices. Each service owns its database and exposes APIs through the API Gateway.

## Services

| Module | Port | Database | Responsibility |
| --- | ---: | --- | --- |
| `discovery-server` | 8761 | - | Eureka service registry |
| `api-gateway` | 8080 | - | Public entry point and routing |
| `identity-service` | 8081 | `smart_cafe_identity_db` | Auth, users, roles, addresses |
| `catalog-service` | 8082 | `smart_cafe_catalog_db` | Categories, products, variants, options |
| `store-service` | 8083 | `smart_cafe_store_db` | Branches, tables, QR sessions, workforce |
| `order-service` | 8084 | `smart_cafe_order_db` | Carts, orders, order status |
| `payment-service` | 8085 | `smart_cafe_payment_db` | Payments, refunds, invoices, cashier shifts |
| `inventory-service` | 8086 | `smart_cafe_inventory_db` | Ingredients, recipes, stock, purchase orders |
| `engagement-service` | 8087 | `smart_cafe_engagement_db` | Loyalty, vouchers, reviews, notifications |
| `intelligence-service` | 8088 | `smart_cafe_intelligence_db` | Chat, knowledge base, forecasts, recommendations |

Catalog public menu APIs (categories, product search, product detail): see [setup, API contract and tests](catalog-service/README.md).

## Structure

```text
backend/
├── .env.example
├── docker-compose.yml
├── docker-compose.hub.yml
├── docker-compose.local.yml
├── pom.xml
├── discovery-server/
├── api-gateway/
├── identity-service/
├── catalog-service/
├── store-service/
├── order-service/
├── payment-service/
├── inventory-service/
├── engagement-service/
└── intelligence-service/
```

The previous modular-monolith prototype under `backend/src/main/java/com/smartcafe/backend/modules` was removed so this folder now represents the microservice design only.

## Docker Compose

Run these commands from the repository root:

```powershell
cd backend
Copy-Item .env.example .env
docker compose up -d --build
```

To run published Docker Hub images with the local overrides, run from `backend/`:

```powershell
docker compose -f docker-compose.hub.yml -f docker-compose.local.yml up -d
```

Compose loads `backend/.env` automatically when run from `backend/`. To run from the repository root instead:

```powershell
docker compose --env-file backend/.env -f backend/docker-compose.hub.yml -f backend/docker-compose.local.yml up -d
```

The project name remains `smart-cafe-ai` so existing Compose volumes and networks keep the same names. Database initialization scripts remain in `../database/`.

OTP email delivery (Identity → RabbitMQ → Engagement → SMTP): see [setup and testing](engagement-service/README.md).
