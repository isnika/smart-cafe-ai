// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/store";
import { handlers } from "@/mocks/handlers";
import { ok, url } from "@/mocks/utils";
import { fakeUser, resetWorld } from "@/test/helpers";
import { polyfillDialog, renderApp } from "@/test/renderApp";

const server = setupServer(...handlers);
const product = { id: 10, name: "Món thử", categoryId: 1, categoryName: "Đồ uống", description: "Mô tả món", status: "Inactive", sortOrder: 1, variantCount: 2, activeVariantCount: 1, price: 25000 };
const detail = { ...product, variants: [{ id: 1, variantName: "Nhỏ", price: 25000, status: "Active" }, { id: 2, variantName: "Lớn", price: 30000, status: "Inactive" }], optionGroups: [{ id: 1, name: "Topping", selectionType: "Multiple", isRequired: false, minSelect: 0, maxSelect: 2, options: [{ id: 1, optionName: "Thạch", extraPrice: 5000, isDefault: false, status: "Inactive" }] }] };
beforeAll(() => { server.listen(); polyfillDialog(); });
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => {
  resetWorld();
  useAuthStore.setState({ status: "authenticated", accessToken: "test-token", user: fakeUser({ id: "admin-test", roleId: 4 }), roleName: "Admin" });
  server.use(http.get(url("/catalog/admin/products"), () => ok([product])), http.get(url("/catalog/admin/categories"), () => ok([])));
});

describe("Chi tiết sản phẩm quản trị", () => {
  it("hiển thị thông tin, biến thể và tùy chọn của sản phẩm ngừng bán", async () => {
    server.use(http.get(url("/catalog/admin/products/10"), () => ok(detail)));
    renderApp("/admin/products");
    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết Món thử" }, { timeout: 10000 }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Mô tả món")).toBeTruthy();
    expect(within(dialog).getByText("Đồ uống")).toBeTruthy();
    expect(within(dialog).getByText("Lớn")).toBeTruthy();
    expect(within(dialog).getByText("Thạch")).toBeTruthy();
    expect(within(dialog).getAllByText(/Ngừng bán/).length).toBeGreaterThanOrEqual(3);
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  }, 15000);
  it("cho phép thử lại khi tải chi tiết thất bại", async () => {
    let calls = 0;
    server.use(http.get(url("/catalog/admin/products/10"), () => ++calls === 1 ? HttpResponse.json({ message: "Lỗi" }, { status: 500 }) : ok(detail)));
    renderApp("/admin/products");
    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết Món thử" }, { timeout: 10000 }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Thử lại" }));
    expect(await within(dialog).findByText("Mô tả món")).toBeTruthy();
  }, 15000);
});
