/**
 * Shared UI controls (ADR-0011) — the single source of truth for the control
 * classes that used to be hand-copied across page stylesheets (`.btn` family,
 * `.icon-btn`, `.seg`, `.input`, `.badge`). Styles are CSS Modules scoped per
 * component; tokens still come from `global.css` (ADR-0008). Pages must consume
 * these components instead of defining the bare classes — `npm run check:css`
 * enforces that.
 */
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./Button/Button";
export {
  IconButton,
  type IconButtonProps,
  type IconButtonSize,
} from "./IconButton/IconButton";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented/Segmented";
export { Input, type InputProps, type InputSize } from "./Input/Input";
export { Badge, type BadgeColor, type BadgeProps } from "./Badge/Badge";
export { Pagination, type PaginationProps } from "./Pagination/Pagination";
