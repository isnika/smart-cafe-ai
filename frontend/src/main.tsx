import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/inter";
import "./index.css";
import "./styles/tokens.css";
import App from "./App";

async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      onUnhandledFrame({ frame, defaults }) {
        // Chỉ cảnh báo với request /api chưa có handler; bỏ qua file tĩnh, HMR, điều hướng trang
        const { request } = frame.data as { request?: Request };
        if (request && new URL(request.url).pathname.startsWith("/api")) {
          defaults.warn();
        }
      },
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
