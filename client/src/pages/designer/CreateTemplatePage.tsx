import { useNavigate } from "react-router-dom";
import { Badge } from "../../components";
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
 * which collects its basic info on /designer/create/blank first, then creates
 * it (auto-checked-out) and jumps into the designer workbench.
 */
export const CreateTemplatePage: React.FC = () => {
  const navigate = useNavigate();

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
          <Badge color="indigo" className="co-tag">
            推荐
          </Badge>
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
          onClick={() => navigate("/designer/create/blank")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate("/designer/create/blank");
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
            创建空白模板
            <ArrowRightIcon />
          </div>
        </div>
      </div>
    </div>
  );
};
