import React from "react";
import { NavLink, Outlet, useMatches } from "react-router-dom";
import { LogoutIcon } from "./icons";
import "./Shell.css";

export interface NavItem {
  to: string;
  label: string;
  /** Feather icon rendered before the label (18×18, tinted by active state). */
  icon?: React.ReactNode;
  count?: number;
  /** Style the count badge as a danger alert (e.g. 通知中心). */
  countTone?: "danger";
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface ShellUser {
  name: string;
  role: string;
}

/** A portal the signed-in user can switch to (rendered in the sidebar footer). */
export interface ShellPortal {
  to: string;
  label: string;
}

/** Per-route page metadata, attached to each route's `handle` (see router). */
export interface ShellHandle {
  /** Page title shown in the topbar — also the page's single `<h1>`. */
  title?: string;
  /** Breadcrumb context shown above the title. */
  crumb?: string;
}

export interface ShellProps {
  brandName: string;
  brandSub?: string;
  navGroups: NavGroup[];
  user?: ShellUser;
  /** Extra controls rendered in the topbar action area, before the bell. */
  actions?: React.ReactNode;
  /** Sign-out handler — when set, a logout button appears next to the user chip. */
  onLogout?: () => void;
  /** Portals the user can switch between — shown when more than one is present. */
  portals?: ShellPortal[];
}

export const Shell: React.FC<ShellProps> = ({
  brandName,
  brandSub,
  navGroups,
  user,
  actions,
  onLogout,
  portals,
}) => {
  // The page title/crumb live on the leaf route's `handle`, not on the Shell —
  // one source of truth, per route. Walk the match chain top-down so a deeper
  // handle overrides a shallower one (index redirects carry no handle).
  const matches = useMatches();
  let title: string | undefined;
  let crumb: string | undefined;
  for (const match of matches) {
    const handle = match.handle as ShellHandle | undefined;
    if (handle?.title) title = handle.title;
    if (handle?.crumb) crumb = handle.crumb;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 15h6M9 11h6" />
            </svg>
          </span>
          <div>
            <div className="brand-name">{brandName}</div>
            {brandSub && <div className="brand-sub">{brandSub}</div>}
          </div>
        </div>

        <nav className="nav-group">
          {navGroups.map((group, index) => (
            <React.Fragment key={group.label ?? index}>
              {group.label && <div className="nav-label">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "nav-item active" : "nav-item"
                  }
                >
                  {item.icon}
                  {item.label}
                  {item.count !== undefined && (
                    <span
                      className={
                        item.countTone === "danger" ? "count danger" : "count"
                      }
                    >
                      {item.count}
                    </span>
                  )}
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </nav>

        {user && (
          <div className="sidebar-foot">
            <div className="shell-user">
              <span className="avatar" aria-hidden="true">
                {user.name.slice(0, 1)}
              </span>
              <div className="grow">
                <div className="u-name">{user.name}</div>
                <div className="u-role">{user.role}</div>
              </div>
              {onLogout && (
                <button
                  type="button"
                  className="logout-btn"
                  aria-label="退出登录"
                  title="退出登录"
                  onClick={onLogout}
                >
                  <LogoutIcon />
                </button>
              )}
            </div>
            {portals && portals.length > 1 && (
              <div className="portal-switcher">
                <span className="portal-switcher-label">切换门户</span>
                {portals.map((portal) => (
                  <NavLink
                    key={portal.to}
                    to={portal.to}
                    className={({ isActive }) =>
                      isActive ? "portal-link active" : "portal-link"
                    }
                  >
                    {portal.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            {crumb && <div className="tb-crumb">{crumb}</div>}
            {title && <h1 className="tb-title">{title}</h1>}
          </div>
          <div className="tb-actions">
            {actions}
            <button className="bell" aria-label="通知" type="button">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="ping" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
