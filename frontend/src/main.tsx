import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/inter";
import "./index.css";
import "./styles/tokens.css";
import App from "./App";
import { USE_MOCK, configureHttp } from "@/shared/api/http";
import { useAuthStore } from "@/features/auth/store";
import { queryClient } from "@/app/providers";

async function bootstrap() {
  // 1) Nối http client với auth store — đúng 1 lần, trước mọi request.
  configureHttp({
    getToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: () => useAuthStore.getState().clear(),
    refresh: () => useAuthStore.getState().refresh(),
  });

  useAuthStore.subscribe((s, prev) => {
    if (prev.status !== "anonymous" && s.status === "anonymous") {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
  });

  // 2) MSW phải sẵn sàng TRƯỚC khi hydrate, nếu không /me sẽ đi thẳng ra mạng thật.
  //    enableMocking() cũng seed đơn demo và gắn window.__mock (db, auth helpers).
  //    VITE_USE_MOCK=true → mock; false/không đặt → gọi API thật (VITE_API_BASE_URL).
  if (USE_MOCK) {
    const { enableMocking } = await import("./mocks/browser");
    await enableMocking();
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
