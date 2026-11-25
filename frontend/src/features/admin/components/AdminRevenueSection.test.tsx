// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AdminRevenueSection } from './AdminRevenueSection';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());

describe('branch revenue filter', () => {
  it('sends snake_case filters and displays only the selected branch', async () => {
    const requests: URL[] = [];
    const handle = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const branch = url.searchParams.get('branch_id');
      const revenue = branch === '1' ? 326000 : 566000;
      const branches = [{ branch_id: 1, orders_count: 4, final_amount: 326000, sub_total: 311000, delivery_fee: 35000 },
        ...(branch ? [] : [{ branch_id: 2, orders_count: 2, final_amount: 240000, sub_total: 222000, delivery_fee: 18000 }])];
      const data = url.pathname.endsWith('/branches')
        ? { branches, total_revenue: revenue }
        : { summary: { total_revenue: revenue, total_orders: branch ? 4 : 6, completed_orders: branch ? 4 : 6, average_order_value: branch ? 81500 : 94333 }, timeline: [], by_branch: branches };
      return HttpResponse.json({ success: true, data });
    };
    server.use(http.get('http://localhost/api/orders/reports/revenue', handle), http.get('http://localhost/api/orders/reports/revenue/branches', handle));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminRevenueSection /></QueryClientProvider>);
    await screen.findAllByText('566.000\u0111');
    fireEvent.click(screen.getByRole('button', { name: /Nguy\u1ec5n Hu\u1ec7 \(Q1\)/ }));
    await waitFor(() => expect(requests.some((r) => r.pathname.endsWith('/revenue') && r.searchParams.get('branch_id') === '1')).toBe(true));
    await waitFor(() => expect(requests.some((r) => r.pathname.endsWith('/branches') && r.searchParams.get('branch_id') === '1')).toBe(true));
    await screen.findAllByText('326.000\u0111');
    const table = screen.getByRole('table');
    expect(within(table).getByText(/Flagship Nguy\u1ec5n Hu\u1ec7/)).toBeTruthy();
    expect(within(table).queryByText(/Landmark 81/)).toBeNull();
    expect(within(table).queryByText(/Ph\u1ed1 C\u1ed5/)).toBeNull();
    expect(within(table).queryByText('566.000\u0111')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tu\u1ea7n' }));
    await waitFor(() => expect(requests.some((r) => r.searchParams.get('branch_id') === '1' && r.searchParams.get('group_by') === 'week')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /T\u1ea5t c\u1ea3 3 chi nh\u00e1nh/ }));
    await screen.findAllByText('566.000\u0111');
    expect(within(table).getByText(/Landmark 81/)).toBeTruthy();
  });
});
