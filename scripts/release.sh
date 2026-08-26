#!/bin/bash
# Build, sign, notarize, and publish a Ghost release to GitHub.
# Requires: Developer ID cert in keychain, APPLE_ID / APPLE_PASSWORD /
# APPLE_TEAM_ID in env, updater key at ~/.tauri/ghost.key, gh CLI logged in.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
TAG="v$VERSION"
BUNDLE=src-tauri/target/release/bundle
TAR="$BUNDLE/macos/Ghost.app.tar.gz"
DMG="$BUNDLE/dmg/Ghost_${VERSION}_aarch64.dmg"

# Explicit key content overrides any TAURI_SIGNING_PRIVATE_KEY already in the
# shell from other projects (a path var loses to a key var otherwise).
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/ghost.key")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

npm run tauri build

cat > "$BUNDLE/latest.json" <<EOF
{
  "version": "$VERSION",
  "notes": "Ghost $VERSION",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$(cat "$TAR.sig")",
      "url": "https://github.com/WynterJones/GhostTerminal/releases/download/$TAG/Ghost.app.tar.gz"
    }
  }
}
EOF

git tag -f "$TAG" && git push origin "$TAG"
gh release create "$TAG" "$DMG" "$TAR" "$TAR.sig" "$BUNDLE/latest.json" \
  --title "Ghost $VERSION" --generate-notes
echo "Released $TAG"
