// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store";
import { handlers } from "@/mocks/handlers";
import { ok, readJson, url } from "@/mocks/utils";
import { fakeUser, resetWorld } from "@/test/helpers";
import { polyfillDialog, renderApp } from "@/test/renderApp";

type Category = {
  id: number;
  name: string;
  image: string | null;
  sortOrder: number;
  status: "Active" | "Inactive";
  totalProductCount: number;
  activeProductCount: number;
};

const server = setupServer(...handlers);
let categories: Category[];

beforeAll(() => {
  server.listen();
  polyfillDialog();
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  resetWorld();
  categories = [
    {
      id: 1,
      name: "Cà phê",
      image: null,
      sortOrder: 1,
      status: "Active",
      totalProductCount: 2,
      activeProductCount: 2,
    },
  ];
  useAuthStore.setState({
    status: "authenticated",
    accessToken: "test-token",
    user: fakeUser({ id: "admin-test", fullName: "Quản trị viên", roleId: 4 }),
    roleName: "Admin",
  });
  server.use(
    http.get(url("/catalog/admin/categories"), () => ok(categories)),
    http.post(url("/catalog/categories"), async ({ request }) => {
      const body = await readJson<Record<string, unknown>>(request);
      const category: Category = {
        id: Math.max(0, ...categories.map((item) => item.id)) + 1,
        name: String(body.name),
        image: (body.image as string | null) ?? null,
        sortOrder: Number(body.sort_order),
        status: body.status === "Inactive" ? "Inactive" : "Active",
        totalProductCount: 0,
        activeProductCount: 0,
      };
      categories = [...categories, category];
      return ok(category);
    }),
    http.put(url("/catalog/categories/:id"), async ({ request, params }) => {
      const body = await readJson<Record<string, unknown>>(request);
      const category: Category = {
        id: Number(params.id),
        name: String(body.name),
        image: (body.image as string | null) ?? null,
        sortOrder: Number(body.sort_order),
        status: body.status === "Inactive" ? "Inactive" : "Active",
        totalProductCount: 0,
        activeProductCount: 0,
      };
      categories = categories.map((item) =>
        item.id === category.id ? category : item,
      );
      return ok(category);
    }),
    http.delete(url("/catalog/categories/:id"), ({ params }) => {
      const id = Number(params.id);
      categories = categories.filter((item) => item.id !== id);
      return ok({ id });
    }),
  );
});

describe("Admin category management", () => {
  it("creates, edits, and deletes a category through the admin page", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/admin/categories");

    expect(await screen.findByRole("heading", { name: "Danh mục" })).toBeTruthy();
    expect(await screen.findByText("Cà phê")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Danh mục" })
        .every((link) => link.getAttribute("href") === "/admin/categories"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    fireEvent.change(screen.getByLabelText("Tên danh mục"), {
      target: { value: "Trà" },
    });
    fireEvent.submit(screen.getByLabelText("Tên danh mục").closest("form")!);
    expect(await screen.findByText("Trà")).toBeTruthy();
    expect(categories).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Sửa" })[1]!);
    fireEvent.change(screen.getByLabelText("Tên danh mục"), {
      target: { value: "Trà & Matcha" },
    });
    fireEvent.submit(screen.getByLabelText("Tên danh mục").closest("form")!);
    expect(await screen.findByText("Trà & Matcha")).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Xoá" })[1]!,
    );
    await waitFor(() => expect(categories).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText("Trà & Matcha")).toBeNull());
    expect(confirm).toHaveBeenCalledWith(
      'Bạn có chắc muốn xoá danh mục "Trà & Matcha"?',
    );
  });
});
