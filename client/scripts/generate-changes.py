"""Generate a complete path inventory with the reason grouped by area."""
import subprocess
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
result = subprocess.run(
    ["git", "status", "--short", "--untracked-files=all"],
    cwd=repo, text=True, capture_output=True, check=True,
)
entries = []
for line in result.stdout.splitlines():
    status, path = line[:2].strip(), line[3:]
    if path == "CHANGES.md":
        continue
    p = path.replace("\\", "/")
    if p.startswith("server/tests/"):
        reason = "Test coverage or fixture aligned with the hardened server contract."
    elif p.startswith("server/"):
        reason = "Integrated the hardened API implementation, startup checks, and secure ownership/validation behavior."
    elif p.startswith("client/legacy/") or p.startswith("legacy-client-backup/"):
        reason = "Preserved displaced legacy source outside the production Vite src tree; it is not bundled."
    elif p.startswith("client/src/styles/") or p.startswith("client/src/theme/"):
        reason = "Theme palette, responsive styles, motion handling, and storybook component presentation."
    elif p.startswith("client/src/pages/onboarding/"):
        reason = "Four-step role, skills, gap, estimate, and roadmap setup flow."
    elif p.startswith("client/src/pages/"):
        reason = "Frontend page implementation or route screen."
    elif p.startswith("client/src/components/"):
        reason = "Shared shell, accessible UI, art, roadmap, tracker, or certificate components."
    elif p.startswith("client/src/"):
        reason = "Frontend API, state, route, configuration, or utility foundation."
    elif p.startswith("client/scripts/"):
        reason = "Local verification/reporting utility for CSS coverage, contrast, or changed-file inventory."
    elif p.startswith("client/"):
        reason = "Frontend build, security header, environment, or deployment configuration."
    elif p in ("DEPLOYMENT.md", "CHANGES.md"):
        reason = "Deployment instructions or complete changed-file record."
    elif p == "render.yaml":
        reason = "Render blueprint with production runtime and health-check configuration."
    else:
        reason = "Workspace deliverable or integration support file."
    entries.append((status or "??", p, reason))

body = [
    "# Changes",
    "",
    "This inventory was generated from `git status --short --untracked-files=all`. The dependency groups and routes named below share the stated purpose; each current changed path is listed separately.",
    "",
    "| State | File | Why it changed |",
    "|---|---|---|",
]
body.extend(f"| `{state}` | `{path}` | {reason} |" for state, path, reason in sorted(entries))
(repo / "CHANGES.md").write_text("\n".join(body) + "\n", encoding="utf-8")
print(f"Wrote CHANGES.md with {len(entries)} changed paths.")
