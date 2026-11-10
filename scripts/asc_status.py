"""Read App Store Connect state for the iOS app: versions, builds, review submissions.

Credentials come from .env.asc at the repo root (gitignored):
  ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH
"""
import sys
import time
from pathlib import Path

import jwt
import requests

ROOT = Path(__file__).resolve().parent.parent
BUNDLE_ID = "com.bookpulse.mobile"
BASE = "https://api.appstoreconnect.apple.com/v1"


def load_env():
    env = {}
    for line in (ROOT / ".env.asc").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


def token(env):
    key = Path(env["ASC_PRIVATE_KEY_PATH"]).read_text()
    now = int(time.time())
    return jwt.encode(
        {"iss": env["ASC_ISSUER_ID"], "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": env["ASC_KEY_ID"]},
    )


def get(session, path, **params):
    r = session.get(f"{BASE}{path}", params=params, timeout=30)
    if r.status_code != 200:
        print(f"GET {path} -> {r.status_code}\n{r.text[:800]}", file=sys.stderr)
        sys.exit(1)
    return r.json()


def main():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {token(load_env())}"

    apps = get(s, "/apps", **{"filter[bundleId]": BUNDLE_ID})["data"]
    if not apps:
        print("No app with bundle id", BUNDLE_ID)
        return
    app = apps[0]
    aid = app["id"]
    print(f"App: {app['attributes']['name']}  id={aid}  sku={app['attributes'].get('sku')}")

    print("\n== App Store versions ==")
    for v in get(s, f"/apps/{aid}/appStoreVersions", limit=10)["data"]:
        a = v["attributes"]
        print(f"  {a['versionString']:8} {a['platform']:5} {a['appStoreState']:28} created={a.get('createdDate')}")

    print("\n== Builds (latest 10) ==")
    for b in get(s, "/builds", **{"filter[app]": aid, "sort": "-uploadedDate", "limit": 10})["data"]:
        a = b["attributes"]
        print(f"  {a['version']:6} {a['processingState']:10} uploaded={a['uploadedDate']} expired={a['expired']}")

    print("\n== Review submissions ==")
    subs = get(s, "/reviewSubmissions", **{"filter[app]": aid, "filter[platform]": "IOS", "limit": 10})["data"]
    if not subs:
        print("  none")
    for sub in subs:
        a = sub["attributes"]
        print(f"  {sub['id']}  state={a['state']}  submitted={a.get('submittedDate')}")
        items = get(s, f"/reviewSubmissions/{sub['id']}/items")["data"]
        for it in items:
            print(f"      item {it['id']} state={it['attributes']['state']}")



if __name__ == "__main__":
    main()
