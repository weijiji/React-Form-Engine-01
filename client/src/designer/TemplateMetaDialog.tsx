import { useEffect, useState } from "react";
import { Button, IconButton, Input } from "../components";
import { CATEGORIES } from "./categories";
import { CloseIcon } from "./icons";

export interface TemplateMeta {
  name: string;
  description: string | null;
  category: string | null;
}

export interface TemplateMetaDialogProps {
  open: boolean;
  initial: TemplateMeta;
  busy: boolean;
  /** Server-side save error surfaced from the parent (kept separate from local validation). */
  error: string | null;
  onClose: () => void;
  onSubmit: (meta: TemplateMeta) => void;
}

/**
 * 基本信息编辑弹窗（BUG-04）— 修改模板名 / 描述 / 分类。表单态由弹窗自持，
 * `open` 或 `initial` 变化时重置；提交前做本地校验（名称、分类非空）。
 */
export const TemplateMetaDialog: React.FC<TemplateMetaDialogProps> = ({
  open,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setDescription(initial.description ?? "");
      setCategory(initial.category ?? "");
      setLocalError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("请输入模板名称");
      return;
    }
    if (!category) {
      setLocalError("请选择模板分类");
      return;
    }
    onSubmit({
      name: trimmed,
      description: description.trim() || null,
      category,
    });
  };

  return (
    <div className="meta-overlay" role="dialog" aria-modal="true" aria-label="编辑基本信息">
      <div className="meta-dialog">
        <div className="meta-head">
          <h3>编辑基本信息</h3>
          <IconButton size="sm" label="关闭" onClick={onClose}>
            <CloseIcon width={14} height={14} />
          </IconButton>
        </div>

        <form className="meta-body" onSubmit={submit}>
          <div className="prop-row">
            <label className="label" htmlFor="metaName">
              模板名称
            </label>
            <Input
              id="metaName"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="prop-row">
            <label className="label" htmlFor="metaDesc">
              模板描述
            </label>
            <textarea
              id="metaDesc"
              className="textarea"
              placeholder="用一句话说明该模板的用途（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="prop-row">
            <label className="label" htmlFor="metaCat">
              模板分类
            </label>
            <select
              id="metaCat"
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">请选择分类</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {(localError ?? error) && (
            <p className="meta-error" role="alert">
              {localError ?? error}
            </p>
          )}

          <div className="meta-actions">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
