/* Every theme the app offers. `mode` drives dark-only tweaks (stars, dimmed scenery). */
export const THEMES = [
  { id: "ocean", name: "Mystic Sea", mode: "light", swatch: "#2f8f8a", bg: "#bfe3f6" },
  { id: "sky", name: "Arctic Bloom", mode: "light", swatch: "#4a8fc7", bg: "#b7d9f5" },
  { id: "grove", name: "Enchanted Garden", mode: "light", swatch: "#5b9a63", bg: "#cde9d2" },
  { id: "midnight", name: "Midnight Sea", mode: "dark", swatch: "#4fd1c5", bg: "#0b1626" },
  { id: "twilight", name: "Twilight Violet", mode: "dark", swatch: "#a78bfa", bg: "#15112b" },
  { id: "moonlit", name: "Moonlit Forest", mode: "dark", swatch: "#6fcf97", bg: "#0c1a13" },
];

export const AUTO_THEME = "auto"; // follow the device's light/dark setting

export const modeOf = (id) => THEMES.find((t) => t.id === id)?.mode || "light";

export function resolveTheme(setting, prefersDark) {
  if (setting === AUTO_THEME) return prefersDark ? "midnight" : "ocean";
  return THEMES.some((t) => t.id === setting) ? setting : "ocean";
}
