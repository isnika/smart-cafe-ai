import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '@/app/router';

/** jsdom chưa có <dialog>.showModal/close; Modal của dự án dựa vào chúng. */
export function polyfillDialog(): void {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

/** Dựng app bằng ĐÚNG cấu hình route thật (router.tsx), chỉ thay router trình duyệt bằng router bộ nhớ. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client, ...utils };
}
