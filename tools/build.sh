#!/usr/bin/env bash
# Build everything the web app needs:
#   1. redirect the game's frame-limiter sleep (tools/patch_jar.py), then recompile the bytecode
#      + our DoJa runtime to JavaScript (TeaVM), once per variant
#   2. copy the original game data next to it
#   3. cut the instruments the music uses out of a General MIDI SoundFont, if one is installed
# Usage: tools/build.sh [localized|delocalized ...]   (default: both)
set -euo pipefail
cd "$(dirname "$0")/.."

variants=("$@")
[ ${#variants[@]} -eq 0 ] && variants=(localized delocalized)

# Game classes we replace with modified decompiled sources: every default-package source file in
# the runtime that is not one of our own classes.
overrides=$(cd runtime/src/main/java && ls *.java | sed 's/\.java$//' | grep -vx -e Boot -e Mods -e StateRoots | paste -sd, -)

for v in "${variants[@]}"; do
  echo "== recompiling $v"
  mkdir -p "build/patched/$v"
  python3 tools/patch_jar.py "original/$v/RockmanDASH.jar" "build/patched/$v/RockmanDASH.jar" --drop "$overrides"
  # save states: hand the game's static fields to the host (generated, per variant)
  python3 tools/state_roots.py "build/patched/$v/RockmanDASH.jar" runtime/src/main/java/StateRoots.java
  (cd runtime && ./mvnw -q -B package -Dvariant="$v")
  mkdir -p "web/public/data/$v"
  cp original/"$v"/RockmanDASH.{jar,jam,sp} "web/public/data/$v/"
done
mkdir -p web/public/data/sdcard
sd_files=(original/sdcard/*.BIN)
if [[ -e "${sd_files[0]}" ]]; then
  cp "${sd_files[@]}" web/public/data/sdcard/
else
  echo "no SD-card BINs found; only data bundled in the scratchpad will be available"
fi

[ -d web/node_modules ] || (cd web && npm install --no-audit --no-fund)

# sampled instruments for the music, if a General MIDI SoundFont is installed (optional: without
# them the host uses its FM patches)
node tools/soundfont/extract.mjs --variant "${variants[0]}" | head -1 || true
echo "done. run: (cd web && npm run dev)"
