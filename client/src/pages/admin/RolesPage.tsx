import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../config/api";
import { ShieldIcon } from "../../layouts/icons";
import type {
  Permission,
  PermissionListResponse,
  Role,
  RoleListResponse,
} from "./types";
import "./admin.css";

/**
 * 角色管理 (work order 09) — role list plus a create/edit editor whose
 * permission codes are checked off from the predefined catalog, grouped by
 * category. Creating a role requires at least one permission (enforced by the
 * server and mirrored here as a disabled save button).
 */

const CATEGORY_ORDER = ["设计器", "填写器", "审批", "数据管理", "管理"];

interface EditorState {
  mode: "create" | "edit";
  role: Role | null;
}

export const RolesPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient<RoleListResponse>("/roles"),
      apiClient<PermissionListResponse>("/permissions"),
    ])
      .then(([roleRes, permRes]) => {
        setRoles(roleRes.items ?? []);
        setPermissions(permRes.items ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const grouped = useMemo(() => {
    const groups: Array<{ category: string; items: Permission[] }> = [];
    const byCategory = new Map<string, Permission[]>();
    for (const p of permissions) {
      const list = byCategory.get(p.category) ?? [];
      list.push(p);
      byCategory.set(p.category, list);
    }
    const ordered = [...CATEGORY_ORDER, ...byCategory.keys()].filter(
      (c, i, arr) => arr.indexOf(c) === i,
    );
    for (const category of ordered) {
      const items = byCategory.get(category);
      if (items && items.length > 0) groups.push({ category, items });
    }
    return groups;
  }, [permissions]);

  return (
    <div className="rbac">
      <div className="rbac-toolbar">
        <button
          type="button"
          className="rbac-btn rbac-btn-primary"
          onClick={() => setEditor({ mode: "create", role: null })}
        >
          新建角色
        </button>
      </div>

      {error ? (
        <p className="rbac-error">加载角色失败：{error}</p>
      ) : loading ? (
        <p className="rbac-empty">加载中…</p>
      ) : roles.length === 0 ? (
        <div className="rbac-empty-state">
          <div className="rbac-empty-state-ico">
            <ShieldIcon />
          </div>
          <h3>还没有角色</h3>
          <p>创建一个角色并勾选权限码，然后分配给用户。</p>
        </div>
      ) : (
        <div className="role-list">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={() => setEditor({ mode: "edit", role })}
              onDeleted={(id) => setRoles((cur) => cur.filter((r) => r.id !== id))}
            />
          ))}
        </div>
      )}

      {editor && (
        <RoleEditor
          mode={editor.mode}
          role={editor.role}
          groups={grouped}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
          }}
        />
      )}
    </div>
  );
};

interface RoleCardProps {
  role: Role;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}

const RoleCard: React.FC<RoleCardProps> = ({ role, onEdit, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient(`/roles/${role.id}`, { method: "DELETE" });
      onDeleted(role.id);
    } catch (err) {
      setDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="role-card">
      <div className="role-card-head">
        <div className="role-card-name">
          <ShieldIcon />
          <div>
            <h3>{role.name}</h3>
            {role.description && <p>{role.description}</p>}
          </div>
        </div>
        <div className="role-card-actions">
          <button type="button" className="rbac-btn" onClick={onEdit}>
            编辑
          </button>
          <button
            type="button"
            className="rbac-btn rbac-btn-danger"
            disabled={deleting}
            onClick={remove}
          >
            {deleting ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
      <div className="role-card-perms">
        {role.permissions.length === 0 ? (
          <span className="rbac-muted">无权限</span>
        ) : (
          role.permissions.map((code) => <span key={code} className="perm-tag">{code}</span>)
        )}
      </div>
      {deleteError && <p className="rbac-error">{deleteError}</p>}
    </div>
  );
};

interface RoleEditorProps {
  mode: "create" | "edit";
  role: Role | null;
  groups: Array<{ category: string; items: Permission[] }>;
  onCancel: () => void;
  onSaved: (role: Role) => void;
}

const RoleEditor: React.FC<RoleEditorProps> = ({
  mode,
  role,
  groups,
  onCancel,
  onSaved,
}) => {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role?.permissions ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSave = name.trim() !== "" && selected.size > 0 && !saving;

  function toggle(code: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    const body = {
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      permissionCodes: [...selected],
    };
    try {
      const saved =
        mode === "create"
          ? await apiClient<Role>("/roles", {
              method: "POST",
              body: JSON.stringify(body),
            })
          : await apiClient<Role>(`/roles/${role?.id}`, {
              method: "PUT",
              body: JSON.stringify(body),
            });
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  }

  return (
    <div className="rbac-editor-overlay" role="dialog" aria-label="角色编辑">
      <div className="rbac-editor-panel">
        <div className="rbac-editor-head">
          <h3>{mode === "create" ? "新建角色" : "编辑角色"}</h3>
          <button type="button" className="rbac-icon-btn" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="rbac-editor-body">
          <label className="rbac-field">
            <span className="rbac-field-label">角色名称</span>
            <input
              className="rbac-input"
              value={name}
              placeholder="如：数据专员"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="rbac-field">
            <span className="rbac-field-label">描述（可选）</span>
            <input
              className="rbac-input"
              value={description}
              placeholder="该角色的职责说明"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="rbac-field">
            <span className="rbac-field-label">
              权限码 <span className="rbac-muted">（至少勾选 1 项）</span>
            </span>
            <div className="perm-groups">
              {groups.map((group) => (
                <div key={group.category} className="perm-group">
                  <span className="perm-group-label">{group.category}</span>
                  <div className="perm-checkboxes">
                    {group.items.map((p) => (
                      <label key={p.code} className="perm-check">
                        <input
                          type="checkbox"
                          checked={selected.has(p.code)}
                          onChange={() => toggle(p.code)}
                        />
                        <span className="perm-check-code">{p.code}</span>
                        <span className="perm-check-name">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="rbac-error">{formError}</p>}
        </div>

        <div className="rbac-editor-foot">
          <button type="button" className="rbac-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="rbac-btn rbac-btn-primary"
            disabled={!canSave}
            onClick={submit}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};
