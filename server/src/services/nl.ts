import { config } from "../config";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../middleware/logger";
import {
  matchRuleSuggestion,
  normalizeSuggestion,
  type FormStructureSuggestion,
} from "form-engine-core";

/**
 * NL 表单生成服务（ADR-0013）。
 *
 * 分层：LLM 出「表单结构建议」→ `normalizeSuggestion` 归一化 → 失败或无 key 时
 * 降级到本地规则引擎（`matchRuleSuggestion`）。所有确定性逻辑都在 shared 包，
 * 这里只做：拼 prompt、调 Anthropic Messages API（tool-use 强制结构化输出）、
 * 错误归因。可测性：全局 `fetch` 可被 mock，无需真实 key。
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `你是一个表单设计助手。用户会用中文描述他们需要的表单，你要把它转成一个「表单结构建议」——这是用户会在界面上预览、编辑的中间结构，不要输出引擎 schema。

规则：
- 只输出用户提到的字段；字段类型从枚举里选，不确定就用 text。
- select/radio/checkbox 必须给 options（字符串数组）。
- 模板名称要简洁，描述一句话用途。
- 若用户提到审批人，忽略它（审批在设计器中配置）。
- 若需求不完整，按常识补合理字段，但不要过度设计。`;

const SUGGEST_TOOL = {
  name: "suggest_form",
  description: "根据用户的自然语言描述，返回一个表单结构建议。",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "模板名称" },
      description: { type: ["string", "null"], description: "模板描述（可选）" },
      sections: {
        type: "array",
        description: "章节。缺省时用户界面会补默认章节。",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "章节标题" },
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "字段标签" },
                  type: {
                    type: "string",
                    enum: [
                      "text",
                      "textarea",
                      "number",
                      "select",
                      "radio",
                      "checkbox",
                      "date",
                      "datetime",
                      "file",
                      "user-picker",
                    ],
                  },
                  required: { type: "boolean" },
                  options: { type: "array", items: { type: "string" } },
                },
                required: ["label", "type", "required"],
              },
            },
          },
          required: ["title", "fields"],
        },
      },
    },
    required: ["name", "sections"],
  },
} as const;

function buildGeneratePrompt(message: string): string {
  return `请根据以下需求生成表单结构：\n${message}`;
}

function buildRefinePrompt(message: string, current: FormStructureSuggestion): string {
  return (
    `当前表单结构建议如下（JSON）：\n${JSON.stringify(current)}\n\n` +
    `请根据这条新要求修改结构，只输出修改后的完整建议（保持语言一致）：\n${message}`
  );
}

/** Safely read an error body without throwing again. */
async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Call the Anthropic Messages API with forced tool-use and return the normalized
 * suggestion. Throws on transport/API/parse failures — callers own the fallback.
 */
export async function callAnthropic(
  userPrompt: string,
): Promise<FormStructureSuggestion> {
  const { apiKey, model, maxTokens } = config.anthropic;
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "suggest_form" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await safeBody(res)).slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const toolUse = data.content?.find((b) => b.type === "tool_use");
  if (!toolUse?.input) {
    throw new Error("Anthropic 未返回 suggest_form 工具调用");
  }
  return normalizeSuggestion(toolUse.input);
}

/**
 * Generate a suggestion. LLM-first; any failure (no key, API error, invalid
 * output) falls back to the local rule engine. Returns `null` only when even the
 * rules miss — the client then guides the user (ADR-0013).
 */
export async function generateSuggestion(
  message: string,
): Promise<FormStructureSuggestion | null> {
  if (config.anthropic.apiKey) {
    try {
      return await callAnthropic(buildGeneratePrompt(message));
    } catch (err) {
      logger.warn({ err }, "NL LLM 生成失败，回退规则引擎");
    }
  }
  return matchRuleSuggestion(message);
}

/**
 * Refine a suggestion with a follow-up message. Requires the LLM — there is no
 * rule fallback for refinement. No key → 503; LLM failure → 502.
 */
export async function refineSuggestion(
  message: string,
  current: FormStructureSuggestion,
): Promise<FormStructureSuggestion> {
  if (!config.anthropic.apiKey) {
    throw new AppError(
      "NL_UNAVAILABLE",
      "当前环境未配置 AI，无法继续修正，请直接在预览中编辑",
      503,
    );
  }
  try {
    return await callAnthropic(buildRefinePrompt(message, current));
  } catch (err) {
    logger.error({ err }, "NL refine 调用失败");
    throw new AppError(
      "NL_GENERATION_FAILED",
      "AI 暂时不可用，请稍后重试，或在预览中直接编辑",
      502,
    );
  }
}
