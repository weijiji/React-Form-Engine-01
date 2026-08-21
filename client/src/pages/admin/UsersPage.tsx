import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../config/api";
import { Pagination } from "../../components";
import { UsersIcon } from "../../layouts/icons";
import type {
  AdminUser,
  RoleListResponse,
  RoleSummary,
  UserListResponse,
} from "./types";
import "./admin.css";

/**
 * 用户管理 (work order 09, completed by BUG-01) — user list with pagination +
 * search/role/status filters, plus the full CRUD surface: create (name/email/
 * initial password/initial roles), edit (name/email/enable-disable), delete
 * (guarded server-side), and the existing role-assignment editor.
 */

const PAGE_SIZE = 20;

export const UsersPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);

  const [data, setData] = useState<UserListResponse | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assigning, setAssigning] = useState<AdminUser | null>(null);
  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; user: AdminUser } | null
  >(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) params.set("search", search.trim());
    if (roleId) params.set("roleId", roleId);
    if (status) params.set("status", status);
    Promise.all([
      apiClient<UserListResponse>(`/users?${params.toString()}`),
      apiClient<RoleListResponse>("/roles"),
    ])
      .then(([userRes, roleRes]) => {
        setData(userRes);
        setRoles(roleRes.items ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, [page, search, roleId, status]);

  useEffect(() => {
    load();
  }, [load, refresh]);

  const users = data?.items ?? [];

  /** After a mutation, jump to page 1 and force a reload (covers page===1). */
  const reloadFromFirstPage = useCallback(() => {
    setPage(1);
    setRefresh((r) => r + 1);
  }, []);

  return (
    <div className="rbac">
      <div className="rbac-toolbar">
        <button
          type="button"
          className="rbac-btn rbac-btn-primary"
          onClick={() => setEditor({ mode: "create" })}
        >
          新增用户
        </button>
      </div>

      <div className="rbac-filters">
        <div className="rbac-search">
          <input
            className="rbac-input"
            placeholder="按姓名或邮箱搜索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput);
                setPage(1);
              }
            }}
          />
          <button
            type="button"
            className="rbac-btn"
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            查询
          </button>
        </div>
        <select
          className="rbac-select"
          value={roleId}
          onChange={(e) => {
            setRoleId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部角色</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="rbac-select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="inactive">停用</option>
        </select>
      </div>

      {error ? (
        <p className="rbac-error">加载用户失败：{error}</p>
      ) : loading ? (
        <p className="rbac-empty">加载中…</p>
      ) : users.length === 0 ? (
        <p className="rbac-empty">暂无用户</p>
      ) : (
        <>
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar">{user.name.slice(0, 1)}</span>
                        <div>
                          <div className="user-name">{user.name}</div>
                          {!user.is_active && (
                            <span className="rbac-badge rbac-badge-gray">已停用</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="rbac-muted">{user.email}</td>
                    <td>
                      {user.roles.length === 0 ? (
                        <span className="rbac-muted">无角色</span>
                      ) : (
                        <div className="role-badges">
                          {user.roles.map((r) => (
                            <span key={r.id} className="rbac-badge rbac-badge-indigo">
                              {r.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="user-actions">
                        <button
                          type="button"
                          className="rbac-btn rbac-btn-sm"
                          onClick={() => setEditor({ mode: "edit", user })}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="rbac-btn rbac-btn-sm"
                          onClick={() => setDeleting(user)}
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          className="rbac-btn rbac-btn-sm"
                          onClick={() => setAssigning(user)}
                        >
                          分配角色
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}

      {assigning && (
        <RoleAssignEditor
          user={assigning}
          roles={roles}
          onCancel={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            load();
          }}
        />
      )}

      {editor && (
        <UserEditor
          mode={editor.mode}
          user={editor.mode === "edit" ? editor.user : undefined}
          roles={roles}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            reloadFromFirstPage();
          }}
        />
      )}

      {deleting && (
        <DeleteConfirm
          user={deleting}
          onCancel={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            reloadFromFirstPage();
          }}
        />
      )}
    </div>
  );
};

interface RoleAssignEditorProps {
  user: AdminUser;
  roles: RoleSummary[];
  onCancel: () => void;
  onSaved: () => void;
}

const RoleAssignEditor: React.FC<RoleAssignEditorProps> = ({
  user,
  roles,
  onCancel,
  onSaved,
}) => {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(user.roles.map((r) => r.id)),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggle(roleId: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    try {
      await apiClient(`/users/${user.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ roleIds: [...selected] }),
      });
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  return (
    <div className="rbac-editor-overlay" role="dialog" aria-label="分配角色">
      <div className="rbac-editor-panel">
        <div className="rbac-editor-head">
          <h3>
            为 <span className="rbac-muted">{user.name}</span> 分配角色
          </h3>
          <button type="button" className="rbac-icon-btn" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="rbac-editor-body">
          <div className="role-picker">
            {roles.map((role) => (
              <label key={role.id} className="perm-check">
                <input
                  type="checkbox"
                  checked={selected.has(role.id)}
                  onChange={() => toggle(role.id)}
                />
                <span className="perm-check-code">{role.name}</span>
                {role.description && (
                  <span className="perm-check-name">{role.description}</span>
                )}
              </label>
            ))}
          </div>
          {roles.length === 0 && (
            <p className="rbac-muted">
              <UsersIcon /> 暂无角色，请先在「角色管理」中创建。
            </p>
          )}
          {formError && <p className="rbac-error">{formError}</p>}
        </div>

        <div className="rbac-editor-foot">
          <button type="button" className="rbac-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="rbac-btn rbac-btn-primary"
            disabled={saving}
            onClick={submit}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface UserEditorProps {
  mode: "create" | "edit";
  user?: AdminUser;
  roles: RoleSummary[];
  onCancel: () => void;
  onSaved: () => void;
}

const UserEditor: React.FC<UserEditorProps> = ({
  mode,
  user,
  roles,
  onCancel,
  onSaved,
}) => {
  const isEdit = mode === "edit";
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => new Set(user?.roles.map((r) => r.id) ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleRole(roleId: string) {
    setSelectedRoles((cur) => {
      const next = new Set(cur);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    try {
      if (isEdit && user) {
        await apiClient(`/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            is_active: isActive,
          }),
        });
      } else {
        await apiClient("/users", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            roleIds: [...selectedRoles],
          }),
        });
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  return (
    <div
      className="rbac-editor-overlay"
      role="dialog"
      aria-label={isEdit ? "编辑用户" : "新增用户"}
    >
      <div className="rbac-editor-panel">
        <div className="rbac-editor-head">
          <h3>{isEdit ? "编辑用户" : "新增用户"}</h3>
          <button type="button" className="rbac-icon-btn" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="rbac-editor-body">
          <label className="rbac-field">
            <span className="rbac-field-label">姓名</span>
            <input
              className="rbac-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="rbac-field">
            <span className="rbac-field-label">邮箱</span>
            <input
              className="rbac-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {!isEdit && (
            <label className="rbac-field">
              <span className="rbac-field-label">初始密码</span>
              <input
                className="rbac-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {isEdit && (
            <label className="perm-check">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="perm-check-code">启用该账号</span>
            </label>
          )}

          {!isEdit && (
            <div className="rbac-field">
              <span className="rbac-field-label">初始角色</span>
              <div className="role-picker">
                {roles.map((role) => (
                  <label key={role.id} className="perm-check">
                    <input
                      type="checkbox"
                      checked={selectedRoles.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    <span className="perm-check-code">{role.name}</span>
                    {role.description && (
                      <span className="perm-check-name">{role.description}</span>
                    )}
                  </label>
                ))}
              </div>
              {roles.length === 0 && (
                <p className="rbac-muted">
                  <UsersIcon /> 暂无角色，请先在「角色管理」中创建。
                </p>
              )}
            </div>
          )}

          {formError && <p className="rbac-error">{formError}</p>}
        </div>

        <div className="rbac-editor-foot">
          <button type="button" className="rbac-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="rbac-btn rbac-btn-primary"
            disabled={saving}
            onClick={submit}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteConfirmProps {
  user: AdminUser;
  onCancel: () => void;
  onDeleted: () => void;
}

const DeleteConfirm: React.FC<DeleteConfirmProps> = ({
  user,
  onCancel,
  onDeleted,
}) => {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setFormError(null);
    try {
      await apiClient(`/users/${user.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "删除失败");
      setSaving(false);
    }
  }

  return (
    <div className="rbac-editor-overlay" role="dialog" aria-label="删除用户">
      <div className="rbac-editor-panel">
        <div className="rbac-editor-head">
          <h3>删除用户</h3>
          <button type="button" className="rbac-icon-btn" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="rbac-editor-body">
          <p>
            确定要删除用户「{user.name}」（{user.email}）吗？此操作不可撤销。
          </p>
          {formError && <p className="rbac-error">{formError}</p>}
        </div>

        <div className="rbac-editor-foot">
          <button type="button" className="rbac-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="rbac-btn rbac-btn-danger"
            disabled={saving}
            onClick={confirm}
          >
            {saving ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
};
