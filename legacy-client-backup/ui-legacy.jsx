import React from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Mascot } from "./art/Mascots";
import { Ornament } from "./art/Scenery";

/** Cream "paper" card with a double frame. */
export const Frame = ({ className = "", children, as: Tag = "section", ...rest }) => (
  <Tag className={`frame ${className}`} {...rest}>
    {children}
  </Tag>
);

/** Page heading with a guide character, in the travel-guide style. */
export function PageHead({ kicker, title, em, text, who, children }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <Ornament />
        {kicker && <span className="kicker">{kicker}</span>}
        <h1>
          {title} {em && <em>{em}</em>}
        </h1>
        {text && <p>{text}</p>}
        {children}
      </div>
      {who && <Mascot who={who} size={118} className="page-head-mascot" />}
    </header>
  );
}

export const Notice = ({ children, tone = "error" }) => (
  <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
    <CircleAlert size={18} />
    <span>{children}</span>
  </div>
);

export const Loading = ({ who = "pearl", title = "Just a moment…", text }) => (
  <Frame className="state-card">
    <Mascot who={who} size={96} />
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    <RefreshCw size={18} className="spin" />
  </Frame>
);

export const Empty = ({ who = "wren", title, text, children }) => (
  <Frame className="state-card">
    <Mascot who={who} size={96} />
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    {children}
  </Frame>
);