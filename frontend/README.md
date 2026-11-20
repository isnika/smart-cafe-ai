# Smart Cafe Frontend Docker Image

This guide is for people who only want to run the published frontend image. You do not need the project source code, Node.js, pnpm, or a local build toolchain. You need Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux), plus access to the backend API Gateway.

## 1. Configure the frontend

Create a working folder and save the following as `docker-compose.yml`:

```yaml
services:
  frontend:
    image: ${FRONTEND_IMAGE:-smartcafe/frontend:latest}
    ports:
      - "${FRONTEND_PORT:-5173}:80"
    env_file:
      - .env
    restart: unless-stopped
```

Save this as `.env` beside `docker-compose.yml` and replace the API URL with the address that the user's browser can reach:

```dotenv
FRONTEND_IMAGE=smartcafe/frontend:latest
FRONTEND_PORT=5173
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=http://host.docker.internal:8080
VITE_USE_MOCK=false
VITE_MOCK_AUTH_BRANCH_ID=1
VITE_GOOGLE_CLIENT_ID=
```

Set `API_PROXY_TARGET` to the backend gateway address reachable from the frontend container. The default `http://host.docker.internal:8080` is for a gateway running on the same computer. For another machine, use its LAN address such as `http://192.168.1.20:8080`. The browser calls the frontend origin and Nginx forwards `/api/*` to this target, avoiding cross-origin browser requests.

Keep `VITE_API_BASE_URL=/api/v1` for the Docker image's same-origin proxy. The frontend calls `/api/v1/...`; Nginx forwards that full path to `API_PROXY_TARGET`. Do not set it to `http://localhost:8080/api/v1` in Docker: that makes the browser call the backend directly and reintroduces the CORS error.

## 2. Start the app

Run these commands in the folder containing the two files:

```powershell
docker compose pull
docker compose up -d
docker compose ps
```

Open `http://localhost:5173` (or the host port selected by `FRONTEND_PORT`). Follow logs with `docker compose logs -f frontend`. Stop the app with `docker compose down`.

To upgrade to a newer published image, update `FRONTEND_IMAGE` to the new tag, then run:

```powershell
docker compose pull
docker compose up -d
```

## Mock mode

For a demo that does not need a backend, set `VITE_USE_MOCK=true` in `.env`. The app then uses its built-in MSW mock data. Set it to `false` to use the backend configured by `VITE_API_BASE_URL`.

## Publish a new image (maintainers)

Run from the repository root. Replace `DOCKERHUB_USER` and `1.0.0` with the Docker Hub account and release tag you own:

```powershell
docker login
docker build -t DOCKERHUB_USER/smartcafe-frontend:1.0.0 ./frontend
docker push DOCKERHUB_USER/smartcafe-frontend:1.0.0
```

Optionally also publish the moving `latest` tag:

```powershell
docker tag DOCKERHUB_USER/smartcafe-frontend:1.0.0 DOCKERHUB_USER/smartcafe-frontend:latest
docker push DOCKERHUB_USER/smartcafe-frontend:latest
```

Tell users to set `FRONTEND_IMAGE` to the image and tag you published. The `.env` values are read when the container starts, so the same image can be used with different API URLs without rebuilding.
