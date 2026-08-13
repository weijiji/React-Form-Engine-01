import React from "react";
import { NavLink, Outlet } from "react-router-dom";
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

export interface ShellProps {
  brandName: string;
  brandSub?: string;
  navGroups: NavGroup[];
  topbarTitle: string;
  topbarCrumb?: string;
  user?: ShellUser;
  /** Extra controls rendered in the topbar action area, before the bell. */
  actions?: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  brandName,
  brandSub,
  navGroups,
  topbarTitle,
  topbarCrumb,
  user,
  actions,
}) => {
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
            </div>
          </div>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            {topbarCrumb && <div className="tb-crumb">{topbarCrumb}</div>}
            <div className="tb-title">{topbarTitle}</div>
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
