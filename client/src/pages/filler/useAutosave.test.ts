import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips the save when values are unchanged (dirty detection)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, { a: 1 }));

    act(() => result.current.onValues({ a: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.label).toBe("");
  });

  it("debounces rapid edits into a single save of the latest values", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, {}));

    act(() => result.current.onValues({ a: 1 }));
    act(() => result.current.onValues({ a: 2 }));
    act(() => result.current.onValues({ a: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ a: 3 });
  });

  it("reports a saved label after persisting", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, {}));

    act(() => result.current.onValues({ a: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.label).toContain("草稿已保存");
  });

  it("flushes immediately on flush()", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, {}));

    act(() => result.current.onValues({ a: 1 }));
    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledWith({ a: 1 });
  });
});
