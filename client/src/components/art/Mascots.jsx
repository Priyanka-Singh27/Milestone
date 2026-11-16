import React from "react";

/* ==================================================
   THE GUIDES — original chibi characters, drawn as
   SVG from one parametric template (no image files).
   Inspired by the sticker-sheet style: big heads,
   small bodies, hats/hoods, animal ears and props.
================================================== */

const Ears = ({ kind, color, inner }) =>
  kind ? (
    <g>
      <polygon points="23,42 26,12 47,28" fill={color} />
      <polygon points="77,42 74,12 53,28" fill={color} />
      <polygon points="28,34 29,19 40,28" fill={inner} />
      <polygon points="72,34 71,19 60,28" fill={inner} />
    </g>
  ) : null;

const HairBack = ({ style, c }) => {
  if (style === "bob")
    return <path d="M19 50 C17 18 83 18 81 50 L83 82 Q50 90 17 82Z" fill={c} />;
  if (style === "wavy")
    return (
      <g fill={c}>
        <circle cx="22" cy="62" r="13" />
        <circle cx="78" cy="62" r="13" />
        <circle cx="30" cy="78" r="11" />
        <circle cx="70" cy="78" r="11" />
        <circle cx="50" cy="30" r="30" />
      </g>
    );
  if (style === "curls")
    return (
      <g fill={c}>
        <circle cx="20" cy="56" r="14" />
        <circle cx="80" cy="56" r="14" />
        <circle cx="24" cy="76" r="12" />
        <circle cx="76" cy="76" r="12" />
        <circle cx="50" cy="28" r="30" />
      </g>
    );
  return null;
};

const HairFront = ({ style, c }) => {
  if (style === "none") return null;
  if (style === "spiky")
    return (
      <path
        d="M22 50 L20 26 L34 36 L40 14 L50 32 L60 14 L66 36 L80 26 L78 50 C66 38 34 38 22 50Z"
        fill={c}
      />
    );
  return <path d="M21 52 C20 20 80 20 79 52 C72 36 58 40 50 34 C42 40 28 36 21 52Z" fill={c} />;
};

const Hat = ({ kind, c, trim }) => {
  switch (kind) {
    case "tricorn":
      return (
        <g>
          <path d="M8 40 Q50 -8 92 40 Q50 28 8 40Z" fill={c} />
          <path d="M8 40 Q50 28 92 40" stroke={trim} strokeWidth="3" fill="none" />
          <path d="M26 24 Q36 -6 50 2 Q62 -6 74 24 Q50 14 26 24Z" fill={c} />
          <circle cx="50" cy="18" r="4" fill="#fff" />
          <path d="M70 6 Q86 -6 88 10 Q80 4 74 12Z" fill="#fff6e0" />
        </g>
      );
    case "witch":
      return (
        <g>
          <ellipse cx="50" cy="34" rx="44" ry="10" fill={c} />
          <path d="M30 34 Q44 -2 72 -6 Q58 14 70 34Z" fill={c} />
          <path d="M31 30 Q50 38 69 30 L68 22 Q50 30 32 22Z" fill="#e9dcb8" />
          <circle cx="60" cy="26" r="3.6" fill="#d6463f" />
          <circle cx="66" cy="29" r="3.6" fill="#d6463f" />
          <path d="M56 24 Q62 18 68 24" stroke="#5aa66b" strokeWidth="3" fill="none" />
        </g>
      );
    case "turban":
      return (
        <g>
          <path d="M22 40 C20 8 80 8 78 40 C66 30 34 30 22 40Z" fill={c} />
          <path d="M26 30 Q50 18 74 30" stroke={trim} strokeWidth="3" fill="none" />
          <path d="M30 22 Q50 10 70 22" stroke="#ffffff55" strokeWidth="2" fill="none" />
          <ellipse cx="62" cy="12" rx="6" ry="14" fill="#e2573b" transform="rotate(24 62 12)" />
          <ellipse cx="62" cy="14" rx="2.6" ry="9" fill="#f6b04a" transform="rotate(24 62 14)" />
          <circle cx="50" cy="26" r="3.6" fill="#f6d35a" />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M21 40 C20 6 80 6 79 40Z" fill={c} />
          <rect x="19" y="34" width="62" height="11" rx="5.5" fill="#fff4dc" />
          <path d="M27 38 H73" stroke={trim} strokeWidth="2.2" strokeDasharray="5 4" />
          <circle cx="50" cy="6" r="8" fill="#fff4dc" />
        </g>
      );
    case "shark":
      return (
        <g>
          <path d="M18 50 C14 10 86 10 82 50 C74 34 58 32 50 32 C42 32 26 34 18 50Z" fill={c} />
          <path d="M42 14 L52 -14 L66 16Z" fill={c} />
          <path d="M18 50 C20 56 24 58 26 54" stroke="#e8f1f4" strokeWidth="3" fill="none" />
          <path d="M26 34 l4 8 l4 -7 l4 8 l4 -6" stroke="#fff" strokeWidth="2.4" fill="none" />
        </g>
      );
    case "shell":
      return (
        <g>
          <path d="M36 28 Q50 4 64 28Z" fill="#f7d9d2" />
          <path d="M44 26 L50 10 L56 26M50 26 V10" stroke="#e6b3aa" strokeWidth="2" fill="none" />
          <circle cx="50" cy="30" r="4" fill="#fff" stroke="#e6e0e6" />
        </g>
      );
    default:
      return null;
  }
};

const Hood = ({ c, trim, ears, inner }) => (
  <g>
    <circle cx="50" cy="52" r="33" fill={c} />
    <Ears kind={ears} color={c} inner={inner} />
    <path d="M20 58 C14 24 86 24 80 58" stroke={trim} strokeWidth="3" fill="none" />
  </g>
);

export function Chibi({
  size = 90,
  skin = "#f3d7bd",
  hair = "#d8b86a",
  hairStyle = "bob",
  hat = "none",
  hatColor = "#6b4a2f",
  trim = "#e8c45a",
  coat = "#4a6a8a",
  belt = "#8a5d43",
  boots = "#5a4030",
  eye = "#4a3a2a",
  ears = null,
  earInner = "#f6b8c4",
  tail = null,
  mouth = "smile",
  patch = false,
  prop = null,
  hood = false,
  className = "",
}) {
  const hoodLike = hood || hat === "shark";
  return (
    <svg
      className={className}
      viewBox="0 0 100 140"
      width={size}
      height={(size * 140) / 100}
      aria-hidden="true"
    >
      <ellipse cx="50" cy="134" rx="24" ry="4" fill="#173f46" opacity=".18" />

      {tail && <path d="M66 108 Q96 104 90 82 Q86 100 64 98Z" fill={tail} />}

      {/* legs & boots */}
      <rect x="37" y="110" width="9" height="16" rx="4" fill={coat} />
      <rect x="54" y="110" width="9" height="16" rx="4" fill={coat} />
      <ellipse cx="41" cy="127" rx="8" ry="5" fill={boots} />
      <ellipse cx="59" cy="127" rx="8" ry="5" fill={boots} />

      {/* body */}
      <path d="M31 84 Q50 78 69 84 L72 116 Q50 122 28 116Z" fill={coat} />
      <rect x="30" y="98" width="40" height="6" rx="2" fill={belt} />
      <rect x="46" y="97" width="8" height="8" rx="2" fill={trim} />
      <ellipse cx="26" cy="96" rx="6" ry="12" fill={coat} transform="rotate(14 26 96)" />
      <ellipse cx="74" cy="96" rx="6" ry="12" fill={coat} transform="rotate(-14 74 96)" />
      <circle cx="23" cy="106" r="4.5" fill={skin} />
      <circle cx="77" cy="106" r="4.5" fill={skin} />

      {/* head */}
      {!hoodLike && !hood && <HairBack style={hairStyle} c={hair} />}
      {(hood || hat === "shark") && (
        <Hood
          c={hatColor}
          trim={trim}
          ears={hood ? ears : null}
          inner={earInner}
        />
      )}
      <circle cx="50" cy="54" r="26" fill={skin} />
      {!hoodLike && ears && <Ears kind={ears} color={hair} inner={earInner} />}
      {!hoodLike && <HairFront style={hairStyle} c={hair} />}
      {hoodLike && hairStyle !== "none" && (
        <path d="M26 50 C32 38 68 38 74 50 C64 44 36 44 26 50Z" fill={hair} />
      )}

      {/* face */}
      <ellipse cx="39" cy="58" rx="3.6" ry="5" fill={eye} />
      <ellipse cx="61" cy="58" rx="3.6" ry="5" fill={eye} />
      <circle cx="40.4" cy="56" r="1.5" fill="#fff" />
      <circle cx="62.4" cy="56" r="1.5" fill="#fff" />
      <ellipse cx="32" cy="66" rx="4.2" ry="2.6" fill="#f08a8a" opacity=".5" />
      <ellipse cx="68" cy="66" rx="4.2" ry="2.6" fill="#f08a8a" opacity=".5" />
      {mouth === "smile" && (
        <path d="M45 68 Q50 73 55 68" stroke="#7a4a3a" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
      {mouth === "open" && <ellipse cx="50" cy="69" rx="3.6" ry="3.8" fill="#8a3a3a" />}
      {mouth === "flat" && (
        <path d="M46 69 H54" stroke="#7a4a3a" strokeWidth="2" strokeLinecap="round" />
      )}
      {patch && (
        <g>
          <path d="M26 46 L74 62" stroke="#222" strokeWidth="2" />
          <ellipse cx="39" cy="58" rx="6.5" ry="6" fill="#2a2a2f" />
        </g>
      )}

      {!hoodLike && <Hat kind={hat} c={hatColor} trim={trim} />}
      {hat === "shark" && null}

      {/* props */}
      {prop === "lamp" && (
        <g transform="translate(0 6)">
          <path d="M8 98 Q16 90 30 98 L26 104 Q16 108 10 104Z" fill="#f2c75a" />
          <path d="M8 98 Q2 92 6 88" stroke="#f2c75a" strokeWidth="3" fill="none" />
          <circle cx="32" cy="98" r="3" fill="#f2c75a" />
        </g>
      )}
      {prop === "wand" && (
        <g>
          <path d="M80 112 L94 82" stroke="#6b4a2f" strokeWidth="3" strokeLinecap="round" />
          <circle cx="95" cy="79" r="3.6" fill="#ffe08a" />
        </g>
      )}
      {prop === "bag" && (
        <g>
          <rect x="66" y="98" width="16" height="15" rx="4" fill="#8a5d43" />
          <path d="M34 82 L74 100" stroke="#8a5d43" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}

/* ---------- the cast ---------- */

export const CAST = {
  captain: {
    name: "Captain Coral",
    role: "Roadmap guide",
    line: "Every great voyage is just one day at a time.",
    props: {
      skin: "#9b6a4c", hair: "#c8433a", hairStyle: "curls", hat: "tricorn",
      hatColor: "#1f2f55", trim: "#e8c45a", coat: "#22345f", belt: "#6b4a2f",
      boots: "#5a3b28", eye: "#2b2b2b", patch: true, mouth: "smile",
    },
  },
  finn: {
    name: "Finn the Shark",
    role: "Practice coach",
    line: "Bite-sized problems. Big-sized skills.",
    props: {
      skin: "#a6c7cd", hair: "#e2a65a", hairStyle: "wavy", hat: "shark",
      hatColor: "#2f4b5a", coat: "#2a2f3a", belt: "#e2a65a", boots: "#222",
      eye: "#e8742c", mouth: "open",
    },
  },
  miso: {
    name: "Miso the Hooded",
    role: "Vault keeper",
    line: "Shiny things go in the vault. Always.",
    props: {
      skin: "#6b4a3c", hair: "#f4f1ea", hairStyle: "bob", hood: true,
      hatColor: "#5a3f7a", trim: "#e8c45a", coat: "#5a3f7a", belt: "#e8c45a",
      boots: "#2a2236", eye: "#d96b3a", ears: "cat", earInner: "#8a6aae",
      tail: "#5a3f7a", mouth: "flat",
    },
  },
  zed: {
    name: "Zed the Wanderer",
    role: "Opportunities scout",
    line: "I found three wishes… and one internship.",
    props: {
      skin: "#b27a5a", hair: "#2a2330", hairStyle: "spiky", hat: "turban",
      hatColor: "#2d6a55", trim: "#f6d35a", coat: "#2d6a55", belt: "#c0392b",
      boots: "#c9a45a", eye: "#c0392b", mouth: "open", prop: "lamp",
    },
  },
  poppy: {
    name: "Poppy the Fox",
    role: "Daily companion",
    line: "Small steps still count. Let's go!",
    props: {
      skin: "#f6dcc0", hair: "#e9b865", hairStyle: "bob", hat: "beanie",
      hatColor: "#d9803c", trim: "#8a5d43", coat: "#d98a4c", belt: "#fff4dc",
      boots: "#8a5d43", eye: "#6b4a2b", ears: "fox", earInner: "#fff4dc",
      tail: "#e9b865", mouth: "smile",
    },
  },
  hazel: {
    name: "Hazel the Witch",
    role: "Quiz master",
    line: "Ready to prove what you know?",
    props: {
      skin: "#f3d7bd", hair: "#e98f52", hairStyle: "wavy", hat: "witch",
      hatColor: "#6b4a2f", coat: "#7a6a3b", belt: "#8a5d43", boots: "#4a3626",
      eye: "#e0a030", mouth: "smile", prop: "bag",
    },
  },
  wren: {
    name: "Wren the Wizard",
    role: "Profile keeper",
    line: "Your story, neatly bound.",
    props: {
      skin: "#f3d7bd", hair: "#d8b86a", hairStyle: "bob", ears: "cat",
      earInner: "#f6b8c4", coat: "#25252f", belt: "#e8c45a", boots: "#25252f",
      eye: "#6b5a2b", mouth: "flat", prop: "wand", tail: "#d8b86a",
    },
  },
  pearl: {
    name: "Pearl the Sprite",
    role: "Tide whisperer",
    line: "The tide always comes back around.",
    props: {
      skin: "#f7e3d6", hair: "#bfe8d2", hairStyle: "curls", hat: "shell",
      coat: "#e9fbf2", belt: "#9fd8bd", boots: "#bfe8d2", eye: "#4fb08a",
      trim: "#9fd8bd", mouth: "smile",
    },
  },
};

export function Mascot({ who = "captain", size = 90, className = "" }) {
  const c = CAST[who] || CAST.captain;
  return <Chibi {...c.props} size={size} className={className} />;
}
