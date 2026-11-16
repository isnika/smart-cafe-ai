import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";

export default function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" />
    </Providers>
  );
}
