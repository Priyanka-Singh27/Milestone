import React, { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Brain, Briefcase, Compass, LayoutDashboard, LogOut, Map, Medal, RefreshCw, Settings, Wifi,
} from "lucide-react";
import { SkyBackdrop } from "./art/Scenery";
import { useAuth } from "../context/AuthContext";
import { useSlowServer } from "../hooks/useSlowServer";
import { ErrorBanner, Loading } from "./ui";
import { friendlyError } from "../config/errors";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/roadmap", label: "Roadmap", icon: Map },
  { to: "/fundamentals", label: "Fundamentals", icon: Brain },
  { to: "/applications", label: "Applications", icon: Briefcase },
  { to: "/vault", label: "Certificates", icon: Medal },
];

export default function AppShell() {
  const { user, logout, profileError, refreshUser, isLoading } = useAuth();
  const slow = useSlowServer();
  const { pathname } = useLocation();
  const main = useRef(null);

  // Move focus to the page on navigation so keyboard + screen-reader users land at the top.
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const name = user?.name || "Explorer";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <SkyBackdrop />

      <header className="topnav">
        <Link to="/dashboard" className="brand" aria-label="Milestone home">
          <span className="brand-mark"><Compass size={20} aria-hidden="true" /></span>
          <span className="brand-name">milestone</span>
        </Link>

        <nav className="topnav-links" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `navlink ${isActive ? "navlink-on" : ""}`}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topnav-user">
          <Link to="/settings" className="user-chip" aria-label="Settings and profile">
            <span className="avatar" aria-hidden="true">{initial}</span>
            <span className="user-name">{name}</span>
          </Link>
          <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {slow && (
        <div className="slow-banner" role="status">
          <Wifi size={16} aria-hidden="true" />
          Waking up the server… free hosting sleeps when it's idle, so the first request can take up to a minute.
        </div>
      )}

      <main id="main" ref={main} tabIndex={-1} className="page">
        {profileError && !user ? (
          <ErrorBanner message={friendlyError(profileError)} onRetry={refreshUser} />
        ) : isLoading && !user ? (
          <Loading who="pearl" title="Opening your workspace…" />
        ) : (
          <Outlet />
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `tab ${isActive ? "tab-on" : ""}`}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => `tab ${isActive ? "tab-on" : ""}`}>
          <Settings size={20} aria-hidden="true" />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
