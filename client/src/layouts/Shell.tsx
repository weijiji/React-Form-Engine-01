import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useMatches } from "react-router-dom";
import { LogoutIcon, MenuIcon } from "./icons";
import "./Shell.css";

export interface NavItem {
  to: string;
  label: string;
  /** Feather icon rendered before the label (18×18, tinted by active state). */
  icon?: React.ReactNode;
  count?: number;
  /** Style the count badge as a danger alert (e.g. 通知中心). */
  countTone?: "danger";
  /** Permission codes that unlock this item (OR). Omit to always show. */
  codes?: string[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface ShellUser {
  name: string;
  role: string;
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
  navGroups: NavGroup[];
  user?: ShellUser;
  /** Extra controls rendered in the topbar action area, before the bell. */
  actions?: React.ReactNode;
  /** Sign-out handler — when set, a logout button appears next to the user chip. */
  onLogout?: () => void;
}

export const Shell: React.FC<ShellProps> = ({
  brandName,
  navGroups,
  user,
  actions,
  onLogout,
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

  // Mobile off-canvas drawer (BUG-03): ≤768px the sidebar is hidden and slides
  // in as an overlay via the topbar hamburger. Close on any route change so a
  // tapped nav item never strands the drawer open.
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="shell">
      <aside className={drawerOpen ? "sidebar open" : "sidebar"}>
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
                  onClick={() => setDrawerOpen(false)}
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
          </div>
        )}
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="关闭菜单"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label="打开菜单"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
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
