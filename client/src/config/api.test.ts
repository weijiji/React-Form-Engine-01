import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, ApiError } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("apiClient silent refresh (work order 17)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once after a 401 from a business endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401) as unknown as Response,
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "u1", name: "张三", email: "a@b.c", roles: [], permissions: [] }) as unknown as Response,
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient<{ items: unknown[] }>("/forms");

    expect(result).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/forms");
  });

  it("does not refresh for auth endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after a failed refresh", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401) as unknown as Response,
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, 401) as unknown as Response,
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient("/forms")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
