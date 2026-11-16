import React, { useEffect } from "react";

/* ==================================================
   SCENERY + PARALLAX
   One passive scroll listener writes --sy (scrollY)
   on <html>. A <Px> layer shifts by (scrollY - top) * p,
   so "top" is the scroll position where it sits still.
   Disabled for reduced-motion and on small screens
   (see app.css).
================================================== */

export function useScrollVar() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const root = document.documentElement;
    let raf = 0;

    const update = () => {
      raf = 0;
      root.style.setProperty("--sy", String(Math.round(window.scrollY)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

/** A layer that drifts at speed p relative to the page (p>0 lags, p<0 rushes). */
export function Px({ p = 0.1, top = 0, className = "", style, children }) {
  return (
    <div
      className={`px ${className}`}
      style={{ ...style, "--p": p, "--top": top }}
    >
      {children}
    </div>
  );
}

/* ---------- landscape props (inline SVG) ---------- */

const shadow = (cx, cy, rx) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry="6" fill="#2f6b5a" opacity=".22" />
);

export const Cloud = () => (
  <svg viewBox="0 0 200 90" aria-hidden="true">
    <ellipse cx="100" cy="78" rx="84" ry="9" fill="#bfdcec" opacity=".55" />
    <g fill="#fff">
      <ellipse cx="100" cy="62" rx="92" ry="24" />
      <circle cx="58" cy="48" r="30" />
      <circle cx="106" cy="36" r="38" />
      <circle cx="152" cy="52" r="26" />
    </g>
  </svg>
);

export const Tree = () => (
  <svg viewBox="0 0 100 120" aria-hidden="true">
    {shadow(50, 112, 28)}
    <rect x="44" y="70" width="12" height="42" rx="5" fill="#a9795a" />
    <circle cx="50" cy="48" r="34" fill="#5fb393" />
    <circle cx="34" cy="62" r="22" fill="#6fc2a1" />
    <circle cx="68" cy="60" r="22" fill="#4fa384" />
    <circle cx="44" cy="38" r="12" fill="#9fe0c2" opacity=".8" />
  </svg>
);

export const Pine = () => (
  <svg viewBox="0 0 80 120" aria-hidden="true">
    {shadow(40, 113, 24)}
    <rect x="35" y="94" width="10" height="18" rx="3" fill="#a9795a" />
    <path d="M40 6 L66 48 H14Z" fill="#4f9f86" />
    <path d="M40 28 L72 74 H8Z" fill="#5fb393" />
    <path d="M40 50 L78 98 H2Z" fill="#6fc2a1" />
    <path d="M40 6 L52 26 H40Z" fill="#9fe0c2" opacity=".6" />
  </svg>
);

export const Windmill = () => (
  <svg viewBox="0 0 120 140" aria-hidden="true">
    {shadow(60, 133, 38)}
    <path d="M40 128 L48 56 H72 L80 128Z" fill="#fff4dc" />
    <path d="M40 128 L44 98 H76 L80 128Z" fill="#f1dfb8" />
    <path d="M42 58 L60 28 L78 58Z" fill="#d97a6c" />
    <rect x="54" y="106" width="12" height="22" rx="5" fill="#a9795a" />
    <g transform="translate(60 54) rotate(18)">
      {[0, 90, 180, 270].map((r) => (
        <rect key={r} x="-5" y="-50" width="10" height="46" rx="2" fill="#fff" stroke="#c9b98f" strokeWidth="2" transform={`rotate(${r})`} />
      ))}
      <circle r="6" fill="#d97a6c" />
    </g>
  </svg>
);

export const Lighthouse = () => (
  <svg viewBox="0 0 90 150" aria-hidden="true">
    {shadow(45, 142, 34)}
    <path d="M28 140 H62 L56 50 H34Z" fill="#fff" />
    <path d="M30.5 112 H59.5 L57.5 90 H32.5Z" fill="#e87d70" />
    <path d="M35 72 H55 L54 56 H36Z" fill="#e87d70" />
    <rect x="30" y="38" width="30" height="14" rx="3" fill="#2d5f66" />
    <path d="M33 38 L45 18 L57 38Z" fill="#e87d70" />
    <circle cx="45" cy="45" r="5" fill="#ffe9a8" />
  </svg>
);

export const Boat = () => (
  <svg viewBox="0 0 120 100" aria-hidden="true">
    <path d="M2 88 Q17 80 32 88 T62 88 T92 88 T118 88" stroke="#8fd0e0" strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M22 68 H98 L86 88 H34Z" fill="#c68a62" />
    <rect x="58" y="14" width="4" height="54" fill="#8a5d43" />
    <path d="M62 16 L96 60 H62Z" fill="#fff" />
    <path d="M58 26 L30 60 H58Z" fill="#f4e7c4" />
  </svg>
);

export const Mountain = () => (
  <svg viewBox="0 0 160 110" aria-hidden="true">
    <path d="M0 108 L56 18 L84 62 L108 34 L160 108Z" fill="#9db7d6" />
    <path d="M84 62 L108 34 L160 108 H90Z" fill="#8aa6c8" opacity=".6" />
    <path d="M56 18 L72 44 L62 40 L56 50 L46 38 L40 44Z" fill="#fff" />
    <path d="M108 34 L120 52 L110 49 L104 58 L96 48Z" fill="#fff" />
  </svg>
);

export const Tent = () => (
  <svg viewBox="0 0 110 90" aria-hidden="true">
    {shadow(55, 84, 40)}
    <path d="M55 10 L102 80 H8Z" fill="#fff4dc" />
    <path d="M55 10 L102 80 H62Z" fill="#ecd9aa" />
    <path d="M55 40 L70 80 H40Z" fill="#d97a6c" />
    <path d="M55 10 V2" stroke="#8a5d43" strokeWidth="3" />
    <path d="M55 2 L70 8 L55 13Z" fill="#e87d70" />
  </svg>
);

export const Flowers = () => (
  <svg viewBox="0 0 100 60" aria-hidden="true">
    {[
      [14, 30, "#f2a7b8"],
      [36, 20, "#fff"],
      [58, 34, "#ffd978"],
      [80, 22, "#f2a7b8"],
      [48, 44, "#fff"],
    ].map(([x, y, c], i) => (
      <g key={i}>
        <path d={`M${x} ${y} V58`} stroke="#4fa384" strokeWidth="3" strokeLinecap="round" />
        <circle cx={x} cy={y} r="9" fill={c} />
        <circle cx={x} cy={y} r="3.5" fill="#f0b64e" />
      </g>
    ))}
  </svg>
);

export const Rocks = () => (
  <svg viewBox="0 0 100 60" aria-hidden="true">
    {shadow(50, 54, 40)}
    <path d="M6 52 Q10 24 34 24 Q54 24 56 52Z" fill="#a7b9c4" />
    <path d="M44 52 Q48 32 66 32 Q86 32 92 52Z" fill="#b9c9d2" />
    <path d="M16 36 Q24 28 34 29" stroke="#fff" strokeWidth="3" fill="none" opacity=".6" strokeLinecap="round" />
  </svg>
);

export const DECOR = { Tree, Pine, Windmill, Lighthouse, Boat, Mountain, Tent, Flowers, Rocks };

/** A hill/water band filled from a theme variable (--hill-1, --hill-2, --hill-3, --lake-1, --lake-2). */
export const Shape = ({ d, tone }) => <path d={d} style={{ fill: `var(--${tone})` }} />;

/* ✦ ——— ✦ divider, the travel-guide flourish */
export const Ornament = ({ children = "✦" }) => (
  <div className="ornate-rule">
    <i />
    <span>{children}</span>
    <i />
  </div>
);

/* ---------- fixed sky behind the whole app ---------- */

const CLOUDS = [
  { x: "6%", y: "9%", w: 190, p: -0.05, o: 0.95 },
  { x: "58%", y: "5%", w: 260, p: -0.09, o: 0.9 },
  { x: "82%", y: "26%", w: 170, p: -0.14, o: 0.85 },
  { x: "24%", y: "42%", w: 220, p: -0.11, o: 0.7 },
  { x: "70%", y: "60%", w: 200, p: -0.07, o: 0.6 },
];

export function SkyBackdrop() {
  useScrollVar();
  return (
    <div className="sky" aria-hidden="true">
      <div className="sky-sun" />
      <div className="sky-stars" />
      {CLOUDS.map((c, i) => (
        <Px
          key={i}
          p={c.p}
          className="sky-cloud"
          style={{ left: c.x, top: c.y, width: c.w, opacity: c.o }}
        >
          <Cloud />
        </Px>
      ))}
      <Px p={0.05} className="sky-hills">
        <svg viewBox="0 0 1440 220" preserveAspectRatio="none">
          <path d="M0 120 Q220 40 460 100 T940 90 T1440 70 V220 H0Z" style={{ fill: "var(--sky-hill-1)" }} />
          <path d="M0 160 Q260 100 520 150 T1040 140 T1440 130 V220 H0Z" style={{ fill: "var(--sky-hill-2)" }} />
        </svg>
      </Px>
    </div>
  );
}
