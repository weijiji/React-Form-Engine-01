import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrgDataSource } from "form-engine-core";
import { FormEngineContext } from "../context";
import { field, fieldProps } from "../testUtils";
import { UserPicker } from "./UserPicker";

const users = [
  { id: "u1", name: "张三" },
  { id: "u2", name: "李四" },
  { id: "u3", name: "王五" },
];

const dataSource: OrgDataSource = {
  getUser: async (id) => users.find((u) => u.id === id) ?? null,
  searchUsers: async (query) => users.filter((u) => u.name.includes(query)),
  getUserManager: async () => null,
  getUsersByDepartment: async () => [],
  getUsersByRole: async () => [],
};

function renderPicker(schema: Parameters<typeof field>[0], props: Record<string, unknown> = {}) {
  return render(
    <FormEngineContext.Provider value={{ orgDataSource: dataSource }}>
      <UserPicker {...fieldProps(field({ type: "user-picker", label: "负责人", ...schema }), props)} />
    </FormEngineContext.Provider>,
  );
}

describe("UserPicker", () => {
  it("searches and selects a single user", async () => {
    const onChange = vi.fn();
    renderPicker({ multiple: false }, { onChange });

    fireEvent.change(screen.getByPlaceholderText("搜索人员"), {
      target: { value: "张" },
    });
    const option = await screen.findByText("张三");
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith("u1");
  });

  it("supports multi-select of user ids", async () => {
    const onChange = vi.fn();
    renderPicker({ multiple: true }, { value: [], onChange });

    fireEvent.change(screen.getByPlaceholderText("搜索人员"), {
      target: { value: "李" },
    });
    fireEvent.click(await screen.findByText("李四"));
    expect(onChange).toHaveBeenCalledWith(["u2"]);
  });

  it("renders an unavailable state without a data source", () => {
    render(<UserPicker {...fieldProps(field({ type: "user-picker", label: "负责人" }))} />);
    expect(screen.getByPlaceholderText("组织数据源不可用")).toBeDisabled();
  });
});
