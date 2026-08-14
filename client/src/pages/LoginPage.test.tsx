import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { LoginPage } from "./LoginPage";

// react-router's data router builds a `Request` for navigation; stub it as in
// the router tests (no loaders, only url/signal are used).
class TestRequest {
  readonly url: string;
  readonly method = "GET";
  readonly signal: AbortSignal | null;
  readonly redirect = "follow";
  readonly headers = { set() {}, has() { return false; }, get() { return null; } };
  constructor(input: string, init?: { signal?: AbortSignal | null }) {
    this.url = input;
    this.signal = init?.signal ?? null;
  }
  clone() { return this; }
  text() { return Promise.resolve(""); }
  formData() { return Promise.resolve(null as never); }
  json() { return Promise.resolve({}); }
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/designer", element: <div>designer-landing</div> },
    ],
    { initialEntries: ["/login"] },
  );
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("Request", TestRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginPage (work order 17)", () => {
  it("renders the login form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401),
      ),
    );
    renderLogin();

    expect(screen.getByText("动态表单引擎")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("logs in and redirects to the primary portal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) {
          return jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401);
        }
        if (url.includes("/auth/login")) {
          return jsonResponse({
            id: "u-1",
            name: "设计员",
            email: "designer@example.com",
            roles: [{ id: "r-designer", name: "设计者", description: null }],
            permissions: [],
            csrfToken: "csrf-123",
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { container } = renderLogin();
    // Wait for the initial /auth/me check to settle (still signed out).
    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "designer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "user123" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("designer-landing")).toBeInTheDocument();
  });

  it("shows the server error on bad credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) {
          return jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401);
        }
        if (url.includes("/auth/login")) {
          return jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" } }, 401);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { container } = renderLogin();
    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "nope@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrong" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("邮箱或密码错误")).toBeInTheDocument();
  });
});
