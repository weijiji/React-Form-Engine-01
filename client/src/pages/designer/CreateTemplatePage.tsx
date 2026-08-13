import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { createEmptySchema } from "../../designer/schemaModel";
import type { FormTemplate } from "../../designer/types";

export const CreateTemplatePage: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiClient<FormTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          schema: createEmptySchema(),
        }),
      });
      // The new template is auto-checked-out to the creator — jump straight in.
      navigate(`/designer/templates/${created.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "创建失败",
      );
      setBusy(false);
    }
  };

  return (
    <div className="create-template">
      <h2 className="create-title">创建新模板</h2>
      <form className="create-form" onSubmit={handleSubmit}>
        <label className="create-field">
          <span>模板名称 *</span>
          <input
            value={name}
            placeholder="例如：员工请假申请"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="create-field">
          <span>分类</span>
          <input
            value={category}
            placeholder="例如：人事"
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <label className="create-field">
          <span>描述</span>
          <textarea
            value={description}
            placeholder="简要说明模板用途"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p className="create-error">{error}</p>}
        <div className="create-actions">
          <button type="submit" disabled={!canSubmit}>
            {busy ? "创建中…" : "创建并开始设计"}
          </button>
          <button type="button" onClick={() => navigate("/designer/templates")}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
};
