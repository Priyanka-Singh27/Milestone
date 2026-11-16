"""Report literal JSX classes that do not have a matching CSS class selector."""
import re
from pathlib import Path

root = Path(__file__).parents[1] / "src"
css = "\n".join(p.read_text(encoding="utf-8") for p in (root / "styles").glob("*.css"))
classes = set()
for path in root.rglob("*.jsx"):
    source = path.read_text(encoding="utf-8")
    for value in re.findall(r'className\s*=\s*["\']([^"\']+)["\']', source):
        classes.update(value.split())
unmatched = sorted(c for c in classes if not re.search(r"\." + re.escape(c) + r"(?![\w-])", css))
print(f"Checked {len(classes)} literal JSX class names.")
print("Unmatched selectors (dynamic classes excluded):")
print("\n".join(unmatched) if unmatched else "none")
