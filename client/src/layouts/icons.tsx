/**
 * Feather icons used in the shared Shell navigation. Each renders a bare
 * 24×24 stroke SVG; sizing/color is owned by CSS (`.nav-item svg` in
 * Shell.css), matching the prototype's `.nav-item svg` rules.
 */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** 我的模板 — 文件 */
export const FileIcon = () => (
  <svg {...svgProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8M16 17H8M10 9H8" />
  </svg>
);

/** 创建表单 — 加号 */
export const PlusIcon = () => (
  <svg {...svgProps}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

/** 草稿模板 — 文件（草稿） */
export const DraftIcon = () => (
  <svg {...svgProps}>
    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z" />
    <path d="M15 3v5h5" />
    <path d="M8 13h8M8 17h5" />
  </svg>
);

/** 通知中心 — 铃铛 */
export const BellIcon = () => (
  <svg {...svgProps}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
