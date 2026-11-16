"""Contrast audit for semantic foreground/background pairs in tokens.css."""
import re
from pathlib import Path

CSS = (Path(__file__).parents[1] / "src/styles/tokens.css").read_text(encoding="utf-8")

def luminance(color):
    channels = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]

def ratio(a, b):
    x, y = sorted((luminance(a), luminance(b)), reverse=True)
    return (x + .05) / (y + .05)

def vars_in(block):
    return dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})", block))

root = vars_in(re.search(r":root\s*\{([^}]+)\}", CSS).group(1))
dark = vars_in(re.search(r'html\[data-theme="midnight"\].*?\{([^}]+)\}', CSS, re.S).group(1))
themes = {}
for name in ("ocean", "sky", "grove", "midnight", "twilight", "moonlit"):
    theme = root.copy()
    for selector, block in re.findall(r"([^{}]+)\{([^{}]+)\}", CSS):
        if re.search(rf'html\[data-theme="{name}"\]', selector):
            theme.update(vars_in(block))
    themes[name] = theme

issues = []
for name, t in themes.items():
    checks = [
        ("body text/surface", "--text", "--surface", 4.5),
        ("body text/surface-2", "--text", "--surface-2", 4.5),
        ("muted text/surface", "--muted", "--surface", 4.5),
        ("heading/page", "--heading", "--page-1", 3),
        ("accent/surface", "--accent", "--surface", 3),
        ("accent text", "--accent-text", "--accent", 4.5),
        ("gold button start", "--gold-text", "--gold-start", 4.5),
        ("gold button end", "--gold-text", "--gold-end", 4.5),
        ("navigation", "--nav-text", "--nav-bg", 4.5),
        ("nav active", "--text", "--nav-active", 4.5),
        ("soft accent", "--text", "--accent-soft", 4.5),
        ("danger notice", "--danger-text", "--danger-bg", 4.5),
        ("success notice", "--success-text", "--success-bg", 4.5),
        ("warning notice", "--warn-text", "--warn-bg", 4.5),
        ("core track", "--text", "--track-core", 4.5),
        ("practice track", "--text", "--track-practice", 4.5),
        ("project track", "--text", "--track-project", 4.5),
    ]
    checks += [
        (f"status {kind}", f"--status-{kind}-text", f"--status-{kind}-bg", 4.5)
        for kind in ("applied", "oa", "interview", "offer", "rejected", "custom")
    ]
    for label, fg, bg, minimum in checks:
        value = ratio(t[fg], t[bg])
        print(f"{name:9} {label:22} {value:.2f}:1")
        if value < minimum:
            issues.append(f"{name}: {label} is {value:.2f}:1 (needs {minimum}:1)")
if issues:
    raise SystemExit("\n".join(issues))
print("All declared semantic pairs meet their WCAG AA threshold.")
