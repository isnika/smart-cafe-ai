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

On Windows, install JDK 17 and start Docker Desktop. From the repository root,
package all backend services (skipping tests), then build images and start the
containers:

```powershell
cd backend
.\mvnw.cmd clean package -DskipTests
docker compose up -d --build
```

Configure `backend/.env` from `.env.example` if you need to override the
Compose defaults. The first Maven build may download dependencies. Check
container status or logs from `backend/` with `docker compose ps -a`
and `docker compose logs --tail=100`.

To run published Docker Hub images, run from `backend/`:

```powershell
docker compose -f docker-compose.hub.yml up -d
```

To also apply the local resource and environment overrides:

```powershell
docker compose -f docker-compose.hub.yml -f docker-compose.local.yml up -d
```

Compose loads `backend/.env` automatically when run from `backend/`. To run from the repository root instead:

```powershell
docker compose --env-file backend/.env -f backend/docker-compose.hub.yml -f backend/docker-compose.local.yml up -d
```

The project name remains `smart-cafe-ai` so existing Compose volumes and networks keep the same names. Database initialization scripts remain in `../database/`.

When editing Identity locally while using the Docker Hub stack, package the service and build the image under the same name referenced by `docker-compose.hub.yml`. Run from `backend/`:

```powershell
.\identity-service\mvnw.cmd -f identity-service/pom.xml package -DskipTests
docker build -t nguyenchanhkhue/smartcafe-identity-service:latest ./identity-service
docker compose -f docker-compose.hub.yml up -d
```

The Identity Dockerfile copies `target/*.jar`, so source changes require packaging before building the image. If `DOCKERHUB_USERNAME` or `TAG` is customized in `backend/.env`, use that repository and tag in the build command. `up -d` recreates the container when its image changes; it does not compile Java or build images. To distribute the update to other machines, publish the updated image to Docker Hub, then pull it on those machines before running `up -d`.

OTP email delivery (Identity → RabbitMQ → Engagement → SMTP): see [setup and testing](engagement-service/README.md).
