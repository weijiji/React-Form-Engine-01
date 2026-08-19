import { Button } from "../Button/Button";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total number of rows matching the filters (before pagination). */
  total: number;
  /** Called with the new 1-based page when the user pages. */
  onChange: (page: number) => void;
}

/**
 * Minimal offset pagination control (BUG-01) — the first shared pagination in
 * the client. Renders 上一页 / 下一页 around a "第 x / 共 n 页" indicator,
 * reusing the shared `<Button>` so the look stays on-token.
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav className={styles.pagination} aria-label="分页">
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span className={styles.info}>
        第 {page} / {totalPages} 页
      </span>
      <Button
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </Button>
    </nav>
  );
};
