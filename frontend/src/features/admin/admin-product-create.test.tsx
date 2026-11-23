// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/store";
import { handlers } from "@/mocks/handlers";
import { ok, readJson, url } from "@/mocks/utils";
import { fakeUser, resetWorld } from "@/test/helpers";
import { polyfillDialog, renderApp } from "@/test/renderApp";

const server = setupServer(...handlers);
beforeAll(() => { server.listen(); polyfillDialog(); });
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => {
  resetWorld();
  useAuthStore.setState({ status: "authenticated", accessToken: "test-token", user: fakeUser({ id: "admin-test", roleId: 4 }), roleName: "Admin" });
  server.use(http.get(url("/catalog/admin/products"), () => ok([])), http.get(url("/catalog/admin/categories"), () => ok([{ id: 1, name: "Cà phê", status: "Active" }])));
});

it("tạo sản phẩm với nhiều biến thể và nhóm tùy chọn", async () => {
  let body: Record<string, unknown> | undefined;
  server.use(http.post(url("/catalog/products"), async ({ request }) => { body = await readJson<Record<string, unknown>>(request); return ok({ id: 42 }); }));
  renderApp("/admin/products");
  fireEvent.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }, { timeout: 10000 }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("option", { name: "Cà phê" });
  fireEvent.change(within(dialog).getByLabelText("Tên sản phẩm"), { target: { value: "Trà mới" } });
  fireEvent.change(within(dialog).getByLabelText("Danh mục"), { target: { value: "1" } });
  fireEvent.change(within(dialog).getByLabelText("Tên biến thể 1"), { target: { value: "Size M" } });
  fireEvent.change(within(dialog).getByLabelText("Giá biến thể 1"), { target: { value: "35000" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm biến thể" }));
  expect((within(dialog).getAllByRole("option", { name: "Size M" })[1] as HTMLOptionElement).disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Tên biến thể 2"), { target: { value: "Size L" } });
  fireEvent.change(within(dialog).getByLabelText("Giá biến thể 2"), { target: { value: "45000" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm nhóm tùy chọn" }));
  fireEvent.change(within(dialog).getByLabelText("Tên nhóm 1"), { target: { value: "Đường" } });
  fireEvent.click(within(dialog).getByLabelText("Bắt buộc chọn"));
  fireEvent.change(within(dialog).getByLabelText("Tên lựa chọn 1 nhóm 1"), { target: { value: "100%" } });
  fireEvent.click(within(dialog).getByLabelText("Mặc định lựa chọn 1 nhóm 1"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm lựa chọn" }));
  fireEvent.change(within(dialog).getByLabelText("Tên lựa chọn 2 nhóm 1"), { target: { value: "50%" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Tạo sản phẩm" }));
  await waitFor(() => expect(body).toBeDefined());
  expect(body).toMatchObject({ name: "Trà mới", category_id: 1, variants: [{ variant_name: "Size M", price: 35000, status: "Active" }, { variant_name: "Size L", price: 45000, status: "Active" }], option_groups: [{ name: "Đường", selection_type: "Single", is_required: true, min_select: 1, max_select: 1, options: [{ option_name: "100%", extra_price: 0, is_default: true }, { option_name: "50%", is_default: false }] }] });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}, 20000);

it("báo lỗi khi giới hạn lựa chọn không hợp lệ", async () => {
  let sent = false;
  server.use(http.post(url("/catalog/products"), () => { sent = true; return ok({ id: 42 }); }));
  renderApp("/admin/products");
  fireEvent.click(await screen.findByRole("button", { name: "Thêm sản phẩm" }, { timeout: 10000 }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("option", { name: "Cà phê" });
  fireEvent.change(within(dialog).getByLabelText("Tên sản phẩm"), { target: { value: "Trà" } });
  fireEvent.change(within(dialog).getByLabelText("Danh mục"), { target: { value: "1" } });
  fireEvent.change(within(dialog).getByLabelText("Tên biến thể 1"), { target: { value: "Size M" } });
  fireEvent.change(within(dialog).getByLabelText("Giá biến thể 1"), { target: { value: "0" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Thêm nhóm tùy chọn" }));
  fireEvent.change(within(dialog).getByLabelText("Tên nhóm 1"), { target: { value: "Topping" } });
  fireEvent.change(within(dialog).getByLabelText("Tên lựa chọn 1 nhóm 1"), { target: { value: "Thạch" } });
  fireEvent.change(within(dialog).getByLabelText("Kiểu lựa chọn nhóm 1"), { target: { value: "Multiple" } });
  fireEvent.change(within(dialog).getByLabelText("Chọn tối thiểu nhóm 1"), { target: { value: "2" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Tạo sản phẩm" }));
  expect(within(dialog).getByRole("alert").textContent).toContain("Kiểm tra số lượng lựa chọn");
  expect(sent).toBe(false);
}, 20000);
