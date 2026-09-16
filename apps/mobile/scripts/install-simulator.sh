#!/usr/bin/env bash
set -euo pipefail

DEVICE="${1:-iPhone 17 Pro}"
BUNDLE_ID="${2:-app.afilmory.local}"

APP_PATH=$(ls -td ~/Library/Developer/Xcode/DerivedData/Afilmory-*/Build/Products/Debug-iphonesimulator/Afilmory.app 2>/dev/null | head -1)
if [[ -z "$APP_PATH" ]]; then
  echo "No built Afilmory.app found. Run: pnpm ios:local" >&2
  exit 1
fi

UDID=$(xcrun simctl list devices booted | grep -F "$DEVICE (" | grep -oE '[0-9A-F-]{36}' | head -1)
if [[ -z "$UDID" ]]; then
  xcrun simctl boot "$DEVICE"
  UDID=$(xcrun simctl list devices | grep -F "$DEVICE (" | grep -oE '[0-9A-F-]{36}' | head -1)
  open -a Simulator
fi

xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl launch "$UDID" "$BUNDLE_ID"
