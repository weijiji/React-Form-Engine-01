import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../config/api";
import { UsersIcon } from "../../layouts/icons";
import type {
  AdminUser,
  RoleListResponse,
  RoleSummary,
  UserListResponse,
} from "./types";
import "./admin.css";

/**
 * 用户管理 (work order 09) — user list plus a role-assignment editor. A user
 * may hold multiple roles; their effective permissions are the union of those
 * roles (computed server-side on every request).
 */

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient<UserListResponse>("/users"),
      apiClient<RoleListResponse>("/roles"),
    ])
      .then(([userRes, roleRes]) => {
        setUsers(userRes.items ?? []);
        setRoles(roleRes.items ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="rbac">
      <div className="rbac-toolbar">
        <h2 className="rbac-title">用户管理</h2>
      </div>

      {error ? (
        <p className="rbac-error">加载用户失败：{error}</p>
      ) : loading ? (
        <p className="rbac-empty">加载中…</p>
      ) : (
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>邮箱</th>
                <th>角色</th>
                <th className="col-actions" />
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
                        {!user.is_active && <span className="badge badge-gray">已停用</span>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{user.email}</td>
                  <td>
                    {user.roles.length === 0 ? (
                      <span className="muted">无角色</span>
                    ) : (
                      <div className="role-badges">
                        {user.roles.map((r) => (
                          <span key={r.id} className="badge badge-indigo">{r.name}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setAssigning(user)}
                    >
                      分配角色
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <div className="editor-overlay" role="dialog" aria-label="分配角色">
      <div className="editor-panel">
        <div className="editor-head">
          <h3>
            为 <span className="muted">{user.name}</span> 分配角色
          </h3>
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="editor-body">
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
            <p className="muted">
              <UsersIcon /> 暂无角色，请先在「角色管理」中创建。
            </p>
          )}
          {formError && <p className="rbac-error">{formError}</p>}
        </div>

        <div className="editor-foot">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
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
