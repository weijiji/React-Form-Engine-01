import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../config/api";
import { Badge, Pagination } from "../../components";
import { UsersIcon } from "../../layouts/icons";
import type {
  AdminUser,
  ApprovalReference,
  ApprovalReferenceListResponse,
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

/** 模板状态徽章（与设计器 TemplatesPage 同约定）。 */
function statusBadge(status: string): React.ReactNode {
  if (status === "published") {
    return (
      <Badge color="green" dot>
        已发布
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge color="amber" dot>
        草稿
      </Badge>
    );
  }
  return (
    <Badge color="gray" dot>
      已归档
    </Badge>
  );
}

/** 引用方式人读标签：「直接引用」「角色成员（角色名）」或两者叠加。 */
function refTypeLabel(ref: ApprovalReference): string {
  const parts: string[] = [];
  if (ref.refTypes.includes("direct")) parts.push("直接引用");
  if (ref.refTypes.includes("role")) {
    const names = (ref.roles ?? []).map((r) => r.name).join("、");
    parts.push(names ? `角色成员（${names}）` : "角色成员");
  }
  return parts.join(" + ");
}

/** 引用模板列表（查看引用弹层 + 停用确认共用）。 */
const RefList: React.FC<{ refs: ApprovalReference[] }> = ({ refs }) => (
  <ul className="rbac-ref-list">
    {refs.map((ref) => (
      <li key={ref.templateId} className="rbac-ref-item">
        <Link to={`/designer/templates/${ref.templateId}`} className="rbac-link">
          {ref.templateName}
        </Link>
        {statusBadge(ref.status)}
        <span className="rbac-muted">{refTypeLabel(ref)}</span>
      </li>
    ))}
  </ul>
);

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
  /** 查看审批链引用的目标用户（工单 23 / ADR-0015 决策 4）。 */
  const [refsUser, setRefsUser] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) params.set("search", search.trim());
    if (roleId) params.set("roleId", roleId);
    if (status) params.set("status", status);
    // BUG-08: the user list is the page's core; the role catalog is only
    // auxiliary (filter dropdown + assignment picker). A /roles failure — e.g.
    // the caller lacks admin:manage_roles — must degrade to an empty picker
    // rather than take the whole page down via Promise.all.
    Promise.all([
      apiClient<UserListResponse>(`/users?${params.toString()}`),
      apiClient<RoleListResponse>("/roles").catch(() => null),
    ])
      .then(([userRes, roleRes]) => {
        setData(userRes);
        setRoles(roleRes?.items ?? []);
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
                          onClick={() => setRefsUser(user)}
                        >
                          查看引用
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

      {refsUser && <ApprovalRefsDialog user={refsUser} onClose={() => setRefsUser(null)} />}
    </div>
  );
};

// ── 审批链引用弹层（工单 23 / ADR-0015 决策 4）────────────────────────────────

interface ApprovalRefsDialogProps {
  user: AdminUser;
  onClose: () => void;
}

const ApprovalRefsDialog: React.FC<ApprovalRefsDialogProps> = ({
  user,
  onClose,
}) => {
  const [refs, setRefs] = useState<ApprovalReference[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient<ApprovalReferenceListResponse>(
      `/users/${user.id}/approval-references`,
    )
      .then((res) => alive && setRefs(res.items))
      .catch((err: unknown) =>
        alive && setError(err instanceof Error ? err.message : "加载失败"),
      );
    return () => {
      alive = false;
    };
  }, [user.id]);

  return (
    <div className="rbac-editor-overlay" role="dialog" aria-label="审批链引用">
      <div className="rbac-editor-panel">
        <div className="rbac-editor-head">
          <h3>
            审批链引用 <span className="rbac-muted">{user.name}</span>
          </h3>
          <button type="button" className="rbac-icon-btn" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="rbac-editor-body">
          {error ? (
            <p className="rbac-error">加载失败：{error}</p>
          ) : refs === null ? (
            <p className="rbac-empty">加载中…</p>
          ) : refs.length === 0 ? (
            <p className="rbac-empty">该用户未被任何模板的审批链引用。</p>
          ) : (
            <>
              <p className="rbac-ref-intro">
                该用户被 {refs.length} 个模板的审批链引用（点击跳转设计器编辑审批链）：
              </p>
              <RefList refs={refs} />
            </>
          )}
        </div>

        <div className="rbac-editor-foot">
          <button type="button" className="rbac-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
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
  /** 停用确认阶段命中的审批链引用；null = 未进入确认。 */
  const [disableRefs, setDisableRefs] = useState<ApprovalReference[] | null>(null);

  function toggleRole(roleId: string) {
    setSelectedRoles((cur) => {
      const next = new Set(cur);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  /** PATCH 当前 name/email/is_active 到正在编辑的用户。 */
  async function patchUser() {
    if (!user) return;
    await apiClient(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        is_active: isActive,
      }),
    });
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    try {
      if (isEdit && user) {
        // 停用前查引用（ADR-0015 决策 2）：有引用 → 先确认（不拦截）；无引用 → 直接停用。
        // 仅当本次由「启用→停用」才提醒——已停用用户的普通改名/改邮箱不重复打扰。
        if (!isActive && user.is_active === true) {
          const refs = await apiClient<ApprovalReferenceListResponse>(
            `/users/${user.id}/approval-references`,
          );
          if (refs.items.length > 0) {
            setDisableRefs(refs.items);
            setSaving(false);
            return;
          }
        }
        await patchUser();
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

  async function confirmDisable() {
    setSaving(true);
    setFormError(null);
    try {
      await patchUser();
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
          {disableRefs !== null ? (
            <>
              <p className="rbac-warn">
                该用户被 {disableRefs.length} 个模板的审批链引用。可继续停用；但提交到该用户（作为审批人）的实例将被拦截。
              </p>
              <RefList refs={disableRefs} />
              {formError && <p className="rbac-error">{formError}</p>}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="rbac-editor-foot">
          {disableRefs !== null ? (
            <>
              <button
                type="button"
                className="rbac-btn"
                disabled={saving}
                onClick={() => setDisableRefs(null)}
              >
                返回
              </button>
              <button
                type="button"
                className="rbac-btn rbac-btn-danger"
                disabled={saving}
                onClick={confirmDisable}
              >
                {saving ? "停用中…" : "确认停用"}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
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
