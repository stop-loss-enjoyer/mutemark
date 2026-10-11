"""Checks the built manifests against the promises in PRIVACY.md and CONTRIBUTING.md.

Run it after ./build.sh. It exits with 1 and says why when a promise is broken.
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
expected_permissions = {
    "chromium": {"bookmarks", "favicon"},
    "firefox": {"bookmarks"},
}
expected_hosts = {"https://api.open-meteo.com", "https://geocoding-api.open-meteo.com"}
problems = []

for browser, expected in expected_permissions.items():
    path = root / "dist" / browser / "manifest.json"
    if not path.is_file():
        problems.append(f"{path}: not built")
        continue
    manifest = json.loads(path.read_text(encoding="utf-8"))

    permissions = set(manifest.get("permissions", []))
    if permissions != expected:
        problems.append(f"{browser}: permissions are {sorted(permissions)}, expected {sorted(expected)}")
    for key in ("host_permissions", "optional_permissions", "optional_host_permissions"):
        if manifest.get(key):
            problems.append(f"{browser}: {key} must not be set, found {manifest[key]}")

    csp = manifest.get("content_security_policy", {}).get("extension_pages", "")
    match = re.search(r"(?:^|;)\s*connect-src\s+([^;]*)", csp)
    hosts = set(match.group(1).split()) if match else set()
    if hosts != expected_hosts:
        problems.append(f"{browser}: connect-src is {sorted(hosts)}, expected {sorted(expected_hosts)}")

if problems:
    print("\n".join(problems), file=sys.stderr)
    sys.exit(1)
print("manifests ok: permissions, host permissions and connect-src as promised")
