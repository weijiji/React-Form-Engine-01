import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { Button, IconButton } from "../../components";
import { FIELD_LABELS } from "../../designer/schemaModel";
import { DocIcon, PlusIcon, SendIcon, TrashIcon } from "../../designer/icons";
import {
  NL_FIELD_TYPES,
  suggestionFieldCount,
  translateSuggestion,
  type FormStructureSuggestion,
  type NlField,
  type NlFieldType,
} from "form-engine-core";
import type { components } from "form-engine-core";
import "./nl.css";

/**
 * NL 对话创建（prototype designer-create-nl.html，ADR-0013）。用户像聊天一样
 * 描述表单需求：首条消息 POST /nl/generate 生成「表单结构建议」，后续消息作为
 * 追加修正 POST /nl/refine 替换当前建议（无状态服务端，建议由本页持有）。建议
 * 在预览卡中可直接编辑（模板名/描述、字段标签/类型/必填/删除、章节增删改名、
 * 添加字段）。确认 → 客户端 `translateSuggestion` 确定性翻译为合法 schema →
 * 复用 POST /templates（category: null，自动签出）→ 跳设计器。
 */

type NlGenerateResponse = components["schemas"]["NlGenerateResponse"];
type NlRefineResponse = components["schemas"]["NlRefineResponse"];
type FormTemplate = components["schemas"]["FormTemplate"];

interface Bubble {
  id: number;
  role: "user" | "ai";
  text: string;
}

const CHOICE_TYPES: readonly NlFieldType[] = ["select", "radio", "checkbox"];
const DEFAULT_CHOICE_OPTIONS = ["选项一", "选项二", "选项三"];

/**
 * API 的 suggestion 允许 `description: string|null`，shared 类型则用
 * `undefined` 表示缺省——把响应收进本地 state 时抹平这个差异。
 */
function toSuggestion(api: NlGenerateResponse["suggestion"]): FormStructureSuggestion | null {
  if (!api) return null;
  return { name: api.name, description: api.description ?? undefined, sections: api.sections };
}

/** 快捷示例（UX 规格 §4.2 六个示例）。label 是 chip 文案，prompt 是发送内容。 */
const EXAMPLES: { label: string; prompt: string }[] = [
  { label: "🏖️ 请假申请单", prompt: "我要一个日常请假申请单，包含请假类型、起止日期、请假天数和事由" },
  { label: "🛒 采购申请单", prompt: "帮我建一个办公用品采购申请表，包含物品清单、预算金额和采购用途" },
  { label: "🖥️ 设备报备单", prompt: "我要一个设备报备单，记录设备名称、设备类型、编号和报备原因" },
  { label: "🧾 报销申请单", prompt: "做一个差旅费用报销单，包含出差事由、费用明细和发票附件" },
  { label: "✈️ 出差申请单", prompt: "我需要一个出差申请单，包含目的地、出发返回日期和出差事由" },
  { label: "👤 入职登记表", prompt: "帮我建员工入职信息登记表，包含姓名、工号、入职日期、部门和联系方式" },
];

let bubbleSeq = 0;

export const NlCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [suggestion, setSuggestion] = useState<FormStructureSuggestion | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // `?.` 兜底：jsdom 不实现 scrollIntoView，浏览器与测试环境都安全。
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [bubbles, busy, suggestion]);

  const pushAi = (text: string) =>
    setBubbles((prev) => [...prev, { id: ++bubbleSeq, role: "ai", text }]);

  /** 首条 → generate；已有建议 → refine（追加修正，ADR-0013）。 */
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || creating) return;
    setBubbles((prev) => [...prev, { id: ++bubbleSeq, role: "user", text }]);
    setInput("");
    setBusy(true);
    setCreateError(null);
    try {
      if (suggestion) {
        const res = await apiClient<NlRefineResponse>("/nl/refine", {
          method: "POST",
          body: JSON.stringify({ message: text, suggestion }),
        });
        setSuggestion(toSuggestion(res.suggestion));
        pushAi("已根据你的要求更新了表单结构 ✅ 可以继续补充描述，或直接创建。");
      } else {
        const res = await apiClient<NlGenerateResponse>("/nl/generate", {
          method: "POST",
          body: JSON.stringify({ message: text }),
        });
        const next = toSuggestion(res.suggestion);
        if (next) {
          setSuggestion(next);
          pushAi("已经理解了你的需求，生成了下面的表单结构 👇 可以在预览卡中直接修改，也可以继续用文字补充。");
        } else {
          pushAi("没能理解你的需求，换个说法描述，或点下面的快捷示例试试。");
        }
      }
    } catch (err) {
      // 失败态：明确错误（服务端已给出可操作文案），建议仍在预览中可直接编辑。
      pushAi(err instanceof ApiError ? err.message : "网络异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  /** 确认 → 确定性翻译 + 复用模板创建流（ADR-0013）。 */
  const create = async () => {
    if (!suggestion || suggestionFieldCount(suggestion) === 0 || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const schema = translateSuggestion(suggestion);
      const created = await apiClient<FormTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: suggestion.name,
          description: suggestion.description || null,
          category: null,
          schema,
        }),
      });
      navigate(`/designer/templates/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "创建失败，请稍后重试。");
      setCreating(false);
    }
  };

  // ── 预览编辑器（纯更新，不可变对象）─────────────────────────────────────

  const updateSuggestion = (fn: (s: FormStructureSuggestion) => FormStructureSuggestion) =>
    setSuggestion((s) => (s ? fn(s) : s));

  const patchSuggestion = (patch: Partial<FormStructureSuggestion>) =>
    updateSuggestion((s) => ({ ...s, ...patch }));

  const patchField = (si: number, fi: number, patch: Partial<NlField>) =>
    updateSuggestion((s) => ({
      ...s,
      sections: s.sections.map((sec, i) =>
        i !== si ? sec : { ...sec, fields: sec.fields.map((f, j) => (j !== fi ? f : { ...f, ...patch })) },
      ),
    }));

  const changeFieldType = (si: number, fi: number, type: NlFieldType) =>
    updateSuggestion((s) => ({
      ...s,
      sections: s.sections.map((sec, i) =>
        i !== si
          ? sec
          : {
              ...sec,
              fields: sec.fields.map((f, j) => {
                if (j !== fi) return f;
                const choice = CHOICE_TYPES.includes(type);
                // 切到选择类型时若没有选项则补默认；切走时丢弃 options。
                return {
                  ...f,
                  type,
                  ...(choice
                    ? { options: f.options && f.options.length > 0 ? f.options : [...DEFAULT_CHOICE_OPTIONS] }
                    : {}),
                };
              }),
            },
      ),
    }));

  const renameSection = (si: number, title: string) =>
    updateSuggestion((s) => ({
      ...s,
      sections: s.sections.map((sec, i) => (i === si ? { ...sec, title } : sec)),
    }));

  const removeSection = (si: number) =>
    updateSuggestion((s) => ({ ...s, sections: s.sections.filter((_, i) => i !== si) }));

  const addSection = () =>
    updateSuggestion((s) => ({
      ...s,
      sections: [...s.sections, { title: `章节 ${s.sections.length + 1}`, fields: [] }],
    }));

  const addField = (si: number) =>
    updateSuggestion((s) => ({
      ...s,
      sections: s.sections.map((sec, i) =>
        i === si ? { ...sec, fields: [...sec.fields, { label: "新字段", type: "text" as const, required: false }] } : sec,
      ),
    }));

  const removeField = (si: number, fi: number) =>
    updateSuggestion((s) => ({
      ...s,
      sections: s.sections.map((sec, i) =>
        i === si ? { ...sec, fields: sec.fields.filter((_, j) => j !== fi) } : sec,
      ),
    }));

  const canCreate = suggestion !== null && suggestionFieldCount(suggestion) > 0;

  return (
    <div className="nl">
      <div className="nl-head">
        <h2>用自然语言描述你的表单 💬</h2>
        <p>像聊天一样说出需求，AI 会生成表单结构供你预览、编辑，确认后直接进入设计器。</p>
      </div>

      <div className="nl-chat">
        <div className="chat">
          <div className="chat-bubble ai">
            <p className="cb-text">
              你好，我是表单助手 👋 请描述你需要的表单，例如：
              <em>“日常请假申请，包含请假类型、起止时间、天数与事由”</em>。也可以从快捷示例开始：
            </p>
            <div className="quick-chips">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  className="quick-chip"
                  disabled={busy || creating}
                  onClick={() => void send(ex.prompt)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {bubbles.map((b) => (
            <div key={b.id} className={`chat-bubble ${b.role}`}>
              <span className="cb-text">{b.text}</span>
            </div>
          ))}

          {busy && (
            <div className="chat-bubble ai">
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {suggestion && (
          <div className="preview">
            <div className="preview-head">
              <span className="pv-ico">
                <DocIcon />
              </span>
              <input
                className="pv-name"
                value={suggestion.name}
                maxLength={60}
                placeholder="模板名称"
                onChange={(e) => patchSuggestion({ name: e.target.value })}
              />
              <span className="pv-status">
                <span className="dot" />
                结构已生成
              </span>
            </div>

            <div className="preview-body">
              <input
                className="pv-desc"
                value={suggestion.description ?? ""}
                maxLength={60}
                placeholder="模板描述（可选）"
                onChange={(e) => patchSuggestion({ description: e.target.value || undefined })}
              />

              {suggestion.sections.map((sec, si) => (
                <div className="pv-section" key={si}>
                  <div className="pv-section-head">
                    <input
                      className="pv-section-title"
                      value={sec.title}
                      maxLength={60}
                      placeholder="章节标题"
                      onChange={(e) => renameSection(si, e.target.value)}
                    />
                    <IconButton label="删除章节" size="sm" onClick={() => removeSection(si)}>
                      <TrashIcon />
                    </IconButton>
                  </div>

                  {sec.fields.map((f, fi) => (
                    <div className="pv-field" key={fi}>
                      <select
                        className="pv-type"
                        value={f.type}
                        onChange={(e) => changeFieldType(si, fi, e.target.value as NlFieldType)}
                      >
                        {NL_FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {FIELD_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <input
                        className="pv-label"
                        value={f.label}
                        maxLength={60}
                        placeholder="字段标签"
                        onChange={(e) => patchField(si, fi, { label: e.target.value })}
                      />
                      <label className="pv-req" title="必填">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => patchField(si, fi, { required: e.target.checked })}
                        />
                        <span>必填</span>
                      </label>
                      <IconButton label="删除字段" size="sm" onClick={() => removeField(si, fi)}>
                        <TrashIcon />
                      </IconButton>
                    </div>
                  ))}

                  <button type="button" className="pv-add-field" onClick={() => addField(si)}>
                    <PlusIcon />
                    添加字段
                  </button>
                </div>
              ))}

              <button type="button" className="pv-add-section" onClick={addSection}>
                <PlusIcon />
                添加章节
              </button>
            </div>

            {createError && <p className="pv-error">{createError}</p>}
            {!canCreate && <p className="pv-hint">请至少保留一个字段后再创建。</p>}

            <div className="preview-actions">
              <Button variant="ghost" onClick={() => inputRef.current?.focus()}>
                继续修改
              </Button>
              <Button
                className="pv-create"
                variant="primary"
                disabled={!canCreate || creating}
                onClick={() => void create()}
              >
                {creating ? "正在创建…" : "创建并进入设计器"}
              </Button>
            </div>
          </div>
        )}

        <div className="chat-input-bar">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={2}
            placeholder={
              suggestion
                ? "继续修改：例如「去掉附件，加上到货日期」…"
                : "描述你的表单需求，按 Enter 发送…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={busy || creating}
          />
          <Button
            variant="primary"
            icon={<SendIcon />}
            disabled={busy || creating || !input.trim()}
            onClick={() => void send(input)}
          >
            {suggestion ? "修改" : "生成"}
          </Button>
        </div>
      </div>
    </div>
  );
};
