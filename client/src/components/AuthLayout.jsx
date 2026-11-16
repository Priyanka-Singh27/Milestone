import React from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Mascot } from "./art/Mascots";
import { Cloud, Px, useScrollVar } from "./art/Scenery";
import { Frame } from "./ui";

export default function AuthLayout({ title, children, footer }) {
  useScrollVar();
  return (
    <div className="auth">
      <div className="auth-sky" aria-hidden="true">
        <Px p={0.3} style={{ left: "8%", top: "12%", width: 220 }} className="abs"><Cloud /></Px>
        <Px p={0.2} style={{ right: "6%", top: "22%", width: 280 }} className="abs"><Cloud /></Px>
      </div>
      <main className="auth-wrap" id="main">
        <div className="auth-cast" aria-hidden="true">
          <Mascot who="captain" size={120} />
          <Mascot who="poppy" size={104} />
        </div>
        <Frame className="auth-card">
          <Link to="/" className="brand auth-brand" aria-label="Milestone home">
            <span className="brand-mark"><Compass size={20} aria-hidden="true" /></span>
            <span className="brand-name">milestone</span>
          </Link>
          <h1>{title}</h1>
          {children}
          {footer && <p className="auth-foot">{footer}</p>}
        </Frame>
      </main>
    </div>
  );
}
