import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/inter";
import "./index.css";
import "./styles/tokens.css";
import App from "./App";
import { configureHttp } from "@/shared/api/http";
import { useAuthStore } from "@/features/auth/store";
import { queryClient } from "@/app/providers";

async function bootstrap() {
  // 1) Nối http client với auth store — đúng 1 lần, trước mọi request.
  configureHttp({
    getToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: () => useAuthStore.getState().clear(),
  });

  useAuthStore.subscribe((s, prev) => {
    if (prev.status !== "anonymous" && s.status === "anonymous") {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
  });

  // 2) MSW phải sẵn sàng TRƯỚC khi hydrate, nếu không /me sẽ đi thẳng ra mạng thật.
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

  // 3) Không await: render ngay, guard hiển thị loading khi status === 'booting'.
  void useAuthStore.getState().hydrate();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
