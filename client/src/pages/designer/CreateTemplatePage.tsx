import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { createEmptySchema } from "../../designer/schemaModel";
import type { FormTemplate } from "../../designer/types";
import {
  ArrowRightIcon,
  BlankDocIcon,
  ChatIcon,
  CheckIcon,
} from "../../designer/icons";
import "./templates.css";

/**
 * Create-form entry chooser (designer-create.html). Two ways to start:
 * natural-language generation (→ /designer/create/nl) or a blank template,
 * which is created + auto-checked-out here and jumps straight into the
 * designer workbench.
 */
export const CreateTemplatePage: React.FC = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBlank = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiClient<FormTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: "未命名模板",
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

  const points = {
    nl: [
      "描述需求即可，例如“请假申请单”",
      "AI 生成章节与字段，可预览后微调",
      "生成后进入设计器继续完善",
    ],
    blank: [
      "创建后自动签出，独享编辑权限",
      "从零开始搭建，完全掌控表单结构",
      "支持从组件面板拖拽/点击添加字段",
    ],
  };

  return (
    <div className="create">
      <div className="create-head">
        <h2>选择一种方式开始设计</h2>
        <p className="sub">
          两种方式均可生成表单模板，创建后可随时在设计器中继续调整。
        </p>
      </div>

      {error && <p className="create-error">{error}</p>}

      <div className="create-grid">
        <div
          className="create-opt nl"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/designer/create/nl")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate("/designer/create/nl");
            }
          }}
        >
          <span className="co-tag badge badge-indigo">推荐</span>
          <div className="co-ico">
            <ChatIcon />
          </div>
          <h3>自然语言创建</h3>
          <p>用一句话描述你的表单需求，AI 自动生成表单结构，省去逐字段配置的时间。</p>
          <div className="co-points">
            {points.nl.map((text) => (
              <div className="co-point" key={text}>
                <CheckIcon />
                {text}
              </div>
            ))}
          </div>
          <div className="co-cta">
            开始对话
            <ArrowRightIcon />
          </div>
        </div>

        <div
          className="create-opt blank"
          role="button"
          tabIndex={0}
          aria-busy={busy}
          onClick={createBlank}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void createBlank();
            }
          }}
        >
          <div className="co-ico">
            <BlankDocIcon />
          </div>
          <h3>空白模板</h3>
          <p>从零开始搭建，完全掌控表单结构。适合结构明确、需要精细配置的场景。</p>
          <div className="co-points">
            {points.blank.map((text) => (
              <div className="co-point" key={text}>
                <CheckIcon />
                {text}
              </div>
            ))}
          </div>
          <div className="co-cta">
            {busy ? "正在创建…" : "创建空白模板"}
            <ArrowRightIcon />
          </div>
        </div>
      </div>
    </div>
  );
};
