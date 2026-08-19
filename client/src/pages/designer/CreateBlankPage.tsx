import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { Button, Input } from "../../components";
import { CATEGORIES } from "../../designer/categories";
import { createEmptySchema } from "../../designer/schemaModel";
import type { FormTemplate } from "../../designer/types";
import "./templates.css";

/**
 * Blank-template creation form (prototype designer-create-blank.html). The
 * designer chooser's "空白模板" card lands here instead of creating straight
 * away, so the template's basic info (name / description / category) is
 * collected before the POST. The created template is auto-checked-out to the
 * creator (POST /templates) and jumps straight into the designer workbench.
 */
export const CreateBlankPage: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入模板名称");
      return;
    }
    if (!category) {
      setError("请选择模板分类");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiClient<FormTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
          category,
          schema: createEmptySchema(),
        }),
      });
      // Auto-checked-out to the creator — jump straight into the designer.
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
    <div className="blank">
      <div className="blank-form">
        <div className="blank-tip">
          <p>
            创建后将 <b>自动签出</b> 该模板并进入设计器。签出期间模板被加锁，其他设计者
            只能只读查看，编辑完成后请及时 <b>签入</b> 保存。
          </p>
        </div>

        <form className="blank-card" onSubmit={submit}>
          <div className="blank-field">
            <label className="blank-label" htmlFor="tplName">
              模板名称 <span className="blank-req">*</span>
            </label>
            <Input
              id="tplName"
              value={name}
              placeholder="例如：员工入职信息登记表"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="blank-field">
            <label className="blank-label" htmlFor="tplDesc">
              模板描述
            </label>
            <textarea
              id="tplDesc"
              className="blank-textarea"
              placeholder="用一句话说明该模板的用途，方便其他用户理解（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="blank-hint">建议填写用途说明，帮助填写者判断该表单适用场景。</div>
          </div>

          <div className="blank-field">
            <label className="blank-label" htmlFor="tplCat">
              模板分类 <span className="blank-req">*</span>
            </label>
            <select
              id="tplCat"
              className="blank-select"
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

          {error && <p className="blank-error">{error}</p>}

          <div className="blank-actions">
            <Button variant="ghost" onClick={() => navigate("/designer/create")}>
              取消
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "正在创建…" : "创建并进入设计器"}
            </Button>
          </div>
        </form>

        <p className="blank-foot">
          创建后可在设计器中通过「组件面板」添加章节与字段，并配置验证规则、条件联动与审批链。
        </p>
      </div>
    </div>
  );
};
