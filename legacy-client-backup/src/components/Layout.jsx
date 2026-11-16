import React from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import { Brain, Briefcase, Compass, LayoutDashboard, Map, Medal } from "lucide-react";
import { SkyBackdrop } from "./art/Scenery";
import { useAuth } from "../context/Auth";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/roadmap", label: "Roadmap", icon: Map },
  { to: "/practice", label: "Practice", icon: Brain },
  { to: "/applications", label: "Applications", icon: Briefcase },
  { to: "/vault", label: "Vault", icon: Medal },
];

export default function Layout() {
  const { profile } = useAuth();
  const initial = (profile?.name || "E").charAt(0).toUpperCase();

  return (
    <div className="app">
      <SkyBackdrop />

      <header className="topnav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Compass size={20} />
          </span>
          <span className="brand-name">milestone</span>
        </Link>

        <nav className="topnav-links" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `navlink ${isActive ? "navlink-on" : ""}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <Link to="/profile" className="avatar" aria-label="Your profile">
          {initial}
        </Link>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `tab ${isActive ? "tab-on" : ""}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}