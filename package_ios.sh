#!/usr/bin/env bash
# Build an unsigned iOS IPA for installation and signing with SideStore.
# Requires macOS, Xcode command-line tools, and XcodeGen (brew install xcodegen).
# Run ./setup_script.sh first so the localized game is compiled.
set -euo pipefail
cd "$(dirname "$0")"

fail() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || fail "IPA builds require a macOS runner with Xcode; use the GitHub Action."
command -v xcodebuild >/dev/null || fail "Xcode command-line tools are required."
command -v xcodegen >/dev/null || fail "XcodeGen is required (brew install xcodegen)."
[[ -f web/public/game/localized/game.js ]] || fail "Run ./setup_script.sh first to build the localized game."

./package_html.sh --small --variant localized
mkdir -p tools/package/ios/Resources build/ios/DerivedData build/ios/ipa-root/Payload build/package
cp build/package/Rockman-DASH-5-Islands-small.html tools/package/ios/Resources/game.html

(cd tools/package/ios && xcodegen generate)
xcodebuild \
  -project tools/package/ios/RockmanDASH.xcodeproj \
  -scheme RockmanDASH \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build/ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

APP=build/ios/DerivedData/Build/Products/Release-iphoneos/RockmanDASH.app
[[ -d "$APP" ]] || fail "Xcode did not produce RockmanDASH.app."
cp -R "$APP" build/ios/ipa-root/Payload/
IPA=build/package/Rockman-DASH-SideStore.ipa
rm -f "$IPA"
(cd build/ios/ipa-root && /usr/bin/zip -q -r "$PWD/../../package/Rockman-DASH-SideStore.ipa" Payload)

printf '\nIPA pronto para abrir no SideStore: %s (%s)\n' "$IPA" "$(du -h "$IPA" | cut -f1)"
