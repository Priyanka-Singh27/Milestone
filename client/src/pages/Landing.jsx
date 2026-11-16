import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Brain, Briefcase, CalendarDays, Compass, Map as MapIcon,
  Medal, ScrollText,
} from "lucide-react";
import { Mascot, CAST } from "../components/art/Mascots";
import {
  Cloud, Flowers, Mountain, Ornament, Pine, Px, Shape, Tree, Windmill, useScrollVar,
} from "../components/art/Scenery";

const MODULES = [
  {
    id: "roadmap", icon: MapIcon, label: "Roadmap", who: "captain",
    title: "A day-by-day voyage",
    text: "Pick a target role and we chart your whole journey, one stop per day. Miss a day? Unfinished tasks quietly slide onto the days ahead.",
  },
  {
    id: "practice", icon: Brain, label: "Practice", who: "finn",
    title: "Fundamentals, bite by bite",
    text: "DSA, OOP, OS, DBMS and networks in small chunks. Mark a topic done and its quiz opens up.",
  },
  {
    id: "applications", icon: Briefcase, label: "Applications", who: "zed",
    title: "Track every opportunity",
    text: "Log internships and jobs, move them from Applied to Offer, and always know where you stand.",
  },
  {
    id: "vault", icon: Medal, label: "Vault", who: "miso",
    title: "Badges that prove it",
    text: "Pass a topic quiz and a platform-verified badge lands in your vault, next to the certificates you upload.",
  },
];

const FEATURES = [
  { icon: CalendarDays, who: "captain", title: "Day stops", text: "Every study day is a stop on the road with 2–4 small tasks. Tick them off as you go." },
  { icon: ScrollText, who: "hazel", title: "Quiz gates", text: "Finish every lesson of a topic and a quiz gate opens. 80% to pass, three tries." },
  { icon: Medal, who: "miso", title: "Verified badges", text: "Pass the gate and your skill is verified and a badge is minted for your vault." },
];

export default function Landing() {
  useScrollVar();
  const [active, setActive] = useState(MODULES[0]);

  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="brand">
          <span className="brand-mark"><Compass size={20} /></span>
          <span className="brand-name">milestone</span>
        </span>
        <Link to="/login" className="btn btn-cream">Sign in</Link>
      </header>

      {/* ---------- cover ---------- */}
      <section className="cover">
        <Px p={0.34} className="cover-layer cover-sky" />
        <Px p={0.3} className="cover-layer cover-clouds">
          <div style={{ left: "6%", top: "14%", width: 220 }}><Cloud /></div>
          <div style={{ left: "52%", top: "6%", width: 300 }}><Cloud /></div>
          <div style={{ left: "78%", top: "26%", width: 180 }}><Cloud /></div>
        </Px>
        <Px p={0.22} className="cover-layer cover-far">
          <div style={{ left: "4%", bottom: 250, width: 300 }}><Mountain /></div>
          <div style={{ left: "58%", bottom: 240, width: 380 }}><Mountain /></div>
          <div style={{ left: "34%", bottom: 236, width: 220, opacity: 0.85 }}><Mountain /></div>
        </Px>
        <Px p={0.14} className="cover-layer cover-lake">
          <svg viewBox="0 0 1200 220" preserveAspectRatio="none">
            <Shape d="M0 80 Q300 40 600 80 T1200 70 V220 H0Z" tone="lake-1" />
            <Shape d="M0 120 Q300 90 600 120 T1200 110 V220 H0Z" tone="lake-2" />
          </svg>
        </Px>
        <Px p={0.08} className="cover-layer cover-mid">
          <div style={{ left: "8%", bottom: 150, width: 130 }}><Windmill /></div>
          <div style={{ left: "20%", bottom: 140, width: 70 }}><Pine /></div>
          <div style={{ right: "10%", bottom: 150, width: 80 }}><Tree /></div>
          <div style={{ right: "19%", bottom: 140, width: 60 }}><Pine /></div>
        </Px>
        <svg className="cover-hill" viewBox="0 0 1200 180" preserveAspectRatio="none">
          <Shape d="M0 80 Q250 20 520 70 T1200 50 V180 H0Z" tone="hill-2" />
          <Shape d="M0 120 Q300 80 640 114 T1200 100 V180 H0Z" tone="hill-3" />
        </svg>
        <div className="cover-flowers"><Flowers /></div>

        <div className="cover-cast">
          <Mascot who="hazel" size={96} />
          <Mascot who="captain" size={118} />
          <Mascot who="poppy" size={104} />
          <Mascot who="finn" size={92} />
        </div>

        <Px p={0.12} className="cover-title">
          <h1>Milestone</h1>
          <div className="cover-rule"><i /><span>✦</span><i /></div>
          <p>Your Career Voyage · Travel Guide</p>
          <div className="cover-cta">
            <Link to="/signup" className="btn btn-gold">Start your voyage <ArrowRight size={17} /></Link>
            <a href="#overview" className="btn btn-ghost">How it works</a>
          </div>
        </Px>
      </section>

      {/* ---------- overview (menu panel + text, like the guide) ---------- */}
      <section className="slide slide-overview" id="overview">
        <div className="slide-scene">
          <Px p={0.1} className="slide-decor" style={{ right: "6%", top: 20, width: 140 }}><Windmill /></Px>
          <Px p={-0.06} className="slide-decor" style={{ left: "3%", bottom: 10, width: 120 }}><Flowers /></Px>
        </div>

        <div className="overview-grid">
          <nav className="guide-menu" aria-label="What's inside">
            <span className="guide-menu-title"><Compass size={15} /> Travel guide</span>
            {MODULES.map((m) => (
              <button
                key={m.id}
                className={`guide-item ${active.id === m.id ? "guide-item-on" : ""}`}
                onClick={() => setActive(m)}
              >
                <m.icon size={17} /> {m.label}
              </button>
            ))}
          </nav>

          <div className="overview-text">
            <h2>{active.title}</h2>
            <p>{active.text}</p>
            <Link to="/signup" className="btn btn-gold">Begin <ArrowRight size={16} /></Link>
          </div>

          <Mascot who={active.who} size={190} className="overview-mascot" />
        </div>
      </section>

      {/* ---------- how it works: framed cards ---------- */}
      <section className="slide slide-teal">
        <h2 className="slide-title"><Ornament /> Must-try milestones <Ornament /></h2>
        <div className="feature-row">
          {FEATURES.map((f) => (
            <article className="frame feature" key={f.title}>
              <Mascot who={f.who} size={88} />
              <span className="feature-icon"><f.icon size={20} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- the cast ---------- */}
      <section className="slide">
        <h2 className="slide-title"><Ornament /> Meet your guides <Ornament /></h2>
        <div className="cast-grid">
          {Object.entries(CAST).map(([id, c]) => (
            <article className="frame cast-card" key={id}>
              <Mascot who={id} size={96} />
              <strong>{c.name}</strong>
              <small>{c.role}</small>
              <p>"{c.line}"</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- finale ---------- */}
      <section className="finale">
        <Px p={0.1} className="finale-word">Begin!</Px>
        <div className="finale-trees">
          <Tree /><Pine /><Tree />
        </div>
        <div className="finale-cast">
          <Mascot who="pearl" size={96} />
          <Mascot who="wren" size={104} />
          <Mascot who="miso" size={100} />
          <Mascot who="zed" size={96} />
        </div>
        <div className="finale-cta">
          <h2>Your first milestone is one click away.</h2>
          <Link to="/signup" className="btn btn-gold">Create my account <ArrowRight size={17} /></Link>
        </div>
      </section>
    </div>
  );
}
