#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="Files"
BUILD_DIR=".build/release"
RELEASE_DIR="release"
APP_BUNDLE="$RELEASE_DIR/$APP_NAME.app"

echo "==> Building release binary"
swift build -c release

echo "==> Assembling $APP_BUNDLE"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"
cp "$BUILD_DIR/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
cp Resources/Info.plist "$APP_BUNDLE/Contents/Info.plist"

echo "==> Ad-hoc signing (no paid Apple Developer certificate needed)"
codesign --force --deep --sign - "$APP_BUNDLE"

echo "==> Verifying signature"
codesign --verify --deep --strict "$APP_BUNDLE"

echo "==> Building DMG"
DMG_STAGING=$(mktemp -d)
cp -R "$APP_BUNDLE" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"
DMG_PATH="$RELEASE_DIR/$APP_NAME.dmg"
rm -f "$DMG_PATH"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGING" -ov -format UDZO "$DMG_PATH"
rm -rf "$DMG_STAGING"

echo "==> Done"
echo "App:  $APP_BUNDLE"
echo "DMG:  $DMG_PATH"
