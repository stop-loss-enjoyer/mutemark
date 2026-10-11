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
forbidden_keys = ("content_scripts", "externally_connectable", "web_accessible_resources", "background")


def directives(csp):
    """Splits a Content Security Policy into a set of whole directives, ignoring order and spacing."""
    return {" ".join(part.split()) for part in csp.split(";") if part.strip()}


base = json.loads((root / "src" / "manifest.base.json").read_text(encoding="utf-8"))
expected_csp = directives(base["content_security_policy"]["extension_pages"])
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

    csp = directives(manifest.get("content_security_policy", {}).get("extension_pages", ""))
    if csp != expected_csp:
        extra = sorted(csp - expected_csp)
        missing = sorted(expected_csp - csp)
        problems.append(f"{browser}: extension_pages CSP differs from src/manifest.base.json, extra {extra}, missing {missing}")

    # The connect-src list is the privacy promise, so it is also checked on its own.
    match = re.search(r"(?:^|;)\s*connect-src\s+([^;]*)", manifest.get("content_security_policy", {}).get("extension_pages", ""))
    hosts = set(match.group(1).split()) if match else set()
    if hosts != expected_hosts:
        problems.append(f"{browser}: connect-src is {sorted(hosts)}, expected {sorted(expected_hosts)}")

    for key in forbidden_keys:
        if key in manifest:
            problems.append(f"{browser}: {key} must not be set")

if problems:
    print("\n".join(problems), file=sys.stderr)
    sys.exit(1)
print("manifests ok: permissions, host permissions, the whole CSP and forbidden keys as promised")
