// Set the palette before first paint so dark theme users do not see a flash.
(function () {
  try {
    var theme = localStorage.getItem("milestone_theme") || "auto";
    if (theme === "auto") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "midnight" : "ocean";
    if (["ocean", "sky", "grove", "midnight", "twilight", "moonlit"].indexOf(theme) === -1) theme = "ocean";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = ["midnight", "twilight", "moonlit"].indexOf(theme) !== -1 ? "dark" : "light";
  } catch (_) {
    document.documentElement.dataset.theme = "ocean";
    document.documentElement.dataset.mode = "light";
  }
})();
