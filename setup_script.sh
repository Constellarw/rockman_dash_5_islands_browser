#!/usr/bin/env bash
# One-step setup for Linux. See easy_setup_guide.md.
#
#   ./setup_script.sh            check tools, sort your game files, build, start the game
#   ./setup_script.sh --yes      answer "yes" to every question (installs without asking)
#   ./setup_script.sh --no-start set everything up but do not start the game
#
# What it does, in order:
#   1. checks for Java (JDK 11+), Node.js (18+), Python 3 and unzip, and offers to install
#      whatever is missing
#   2. takes the game files you put in the gamefiles/ folder (zips or loose files), finds the
#      ones the port needs and copies them into original/
#   3. builds the game (the first time this downloads build tools and takes a few minutes)
#   4. starts it and opens your browser; afterwards ./play.sh does that on its own
set -euo pipefail
cd "$(dirname "$0")"

YES=0
START=1
ONLY_FILES=0
for arg in "$@"; do
  case "$arg" in
    --yes | -y) YES=1 ;;
    --no-start) START=0 ;;
    --files-only) ONLY_FILES=1 ;; # sort the game files and stop (used to test this script)
    -h | --help) sed -n 2,14p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32mok\033[0m  %s\n' "$*"; }
note() { printf '  \033[33m!!\033[0m  %s\n' "$*"; }
fail() { printf '\n\033[31mStopped:\033[0m %s\n' "$*"; exit 1; }
ask() {  # ask "question" -> 0 for yes
  [ "$YES" = 1 ] && return 0
  local reply
  read -r -p "  $1 [y/N] " reply || return 1
  [[ "$reply" =~ ^[Yy] ]]
}

# ---- 1. tools ----------------------------------------------------------------------------------
java_major() { java -version 2>&1 | sed -n 's/.*version "\(1\.\)\{0,1\}\([0-9]*\).*/\2/p' | head -1; }
node_major() { node --version 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'; }

install_packages() {  # install_packages <what it is for> <apt names> <dnf names> <pacman names> <zypper names>
  local why=$1 cmd=""
  if command -v apt-get > /dev/null; then cmd="sudo apt-get install -y $2"
  elif command -v dnf > /dev/null; then cmd="sudo dnf install -y $3"
  elif command -v pacman > /dev/null; then cmd="sudo pacman -S --needed --noconfirm $4"
  elif command -v zypper > /dev/null; then cmd="sudo zypper install -y $5"
  fi
  if [ -z "$cmd" ]; then
    note "I don't know this system's package manager. Please install $why yourself, then run me again."
    return 1
  fi
  echo "      $cmd"
  if ask "Install $why now with the command above?"; then
    $cmd
  else
    return 1
  fi
}

check_tools() {
  bold "1/4  Checking the tools the build needs"
  [ "$(uname -s)" = Linux ] || note "This script is written for Linux; on $(uname -s) it may not work."

  if ! command -v unzip > /dev/null || ! command -v python3 > /dev/null; then
    install_packages "unzip and Python 3" "unzip python3" "unzip python3" "unzip python" "unzip python3" \
      || fail "unzip and python3 are needed."
  fi
  ok "unzip, $(python3 --version 2>&1)"

  local jm
  jm=$(command -v javac > /dev/null && java_major || echo 0)
  if [ "${jm:-0}" -lt 11 ]; then
    note "A Java development kit (JDK 11 or newer) is needed to translate the game."
    install_packages "a JDK (OpenJDK 17)" "openjdk-17-jdk" "java-17-openjdk-devel" "jdk17-openjdk" "java-17-openjdk-devel" \
      || fail "a JDK is needed (the 'javac' command)."
    jm=$(java_major)
  fi
  ok "Java $jm"

  if [ "$(node_major || echo 0)" -lt 18 ] 2> /dev/null || ! command -v npm > /dev/null; then
    note "Node.js 18 or newer is needed (found: $(node --version 2> /dev/null || echo none))."
    echo "      Distribution packages are often too old, so the usual way is nvm, which installs"
    echo "      Node into your home folder without sudo:"
    echo "      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install 22"
    if ask "Install Node.js 22 with nvm now?"; then
      command -v curl > /dev/null || install_packages "curl" curl curl curl curl || fail "curl is needed to fetch nvm."
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
      export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
      # shellcheck disable=SC1091
      . "$NVM_DIR/nvm.sh"
      nvm install 22
    else
      fail "Node.js 18+ is needed."
    fi
  fi
  ok "Node.js $(node --version)"
}

# ---- 2. game files -----------------------------------------------------------------------------
# What the port needs, per variant of the English patch: RockmanDASH.jar, .jam and .sp; and the
# island data from the SD card: RDDATA0.BIN .. RDDATA4.BIN and RDDATA00.BIN .. RDDATA44.BIN.
SD_FILES=()
for i in 0 1 2 3 4; do
  SD_FILES+=("RDDATA$i.BIN")
  for n in 0 1 2 3 4; do SD_FILES+=("RDDATA$i$n.BIN"); done
done

have_variant() { [ -f "original/$1/RockmanDASH.jar" ] && [ -f "original/$1/RockmanDASH.jam" ] && [ -f "original/$1/RockmanDASH.sp" ]; }
missing_sd() {
  local f
  for f in "${SD_FILES[@]}"; do [ -f "original/sdcard/$f" ] || echo "$f"; done
}

sort_game_files() {
  bold "2/4  Looking for your game files"
  mkdir -p gamefiles
  local pool=build/setup/unpacked
  rm -rf "$pool"
  mkdir -p "$pool"
  # unpack every zip in gamefiles/ (and zips inside those, one level down)
  local z n=0
  while IFS= read -r -d '' z; do
    n=$((n + 1))
    unzip -q -o "$z" -d "$pool/zip$n" 2> /dev/null || note "could not unpack $(basename "$z")"
  done < <(find gamefiles -type f -iname '*.zip' -print0)
  while IFS= read -r -d '' z; do
    n=$((n + 1))
    unzip -q -o "$z" -d "$pool/zip$n" 2> /dev/null || true
  done < <(find "$pool" -type f -iname '*.zip' -print0)

  # the English patch: the folder names say which variant a file belongs to
  local variant ext found
  for variant in delocalized localized; do
    for ext in jar jam sp; do
      [ -f "original/$variant/RockmanDASH.$ext" ] && continue
      if [ "$variant" = localized ]; then
        found=$(find gamefiles "$pool" -type f ! -name '._*' ! -ipath '*/__MACOSX/*' -iname "*.$ext" -ipath '*localized*' ! -ipath '*delocalized*' | head -1)
      else
        found=$(find gamefiles "$pool" -type f ! -name '._*' ! -ipath '*/__MACOSX/*' -iname "*.$ext" -ipath '*delocalized*' | head -1)
      fi
      if [ -n "$found" ]; then
        mkdir -p "original/$variant"
        cp "$found" "original/$variant/RockmanDASH.$ext"
      fi
    done
  done
  # the SD card's island data, whatever the letter case of the names
  local f
  for f in "${SD_FILES[@]}"; do
    [ -f "original/sdcard/$f" ] && continue
    found=$(find gamefiles "$pool" -type f ! -name '._*' ! -ipath '*/__MACOSX/*' -iname "$f" | head -1)
    if [ -n "$found" ]; then
      mkdir -p original/sdcard
      cp "$found" "original/sdcard/$f"
    fi
  done
  rm -rf "$pool"

  VARIANTS=()
  for variant in localized delocalized; do
    if have_variant "$variant"; then
      VARIANTS+=("$variant")
      ok "English patch, $variant: jar, jam, sp"
    else
      note "English patch, $variant: not found (that is fine if you only want the other one)"
    fi
  done
  local sd_missing
  sd_missing=$(missing_sd | wc -l)
  if [ "$sd_missing" = 0 ]; then
    ok "SD-card island data: all ${#SD_FILES[@]} files"
  else
    note "SD-card island data: $sd_missing of ${#SD_FILES[@]} files missing ($(missing_sd | head -4 | tr '\n' ' ')...)"
  fi
  if [ ${#VARIANTS[@]} = 0 ]; then
    cat << 'TEXT'

  The game's own files are not part of this project; you need your own copy.
  Put them in the "gamefiles" folder next to this script and run it again. Zips are fine,
  the script unpacks them and picks out what it needs:

    * the English patch for the game (its "Localized" and/or "Delocalized" folder, each with a
      .jar, a .jam and a .sp file)

  easy_setup_guide.md says more about what these are.
TEXT
    fail "English patch files are missing (see above)."
  fi
  if [ "$sd_missing" != 0 ]; then
    note "SD-card data is missing; the game can only use data already bundled in the scratchpad"
  fi
}

# ---- 3. build ----------------------------------------------------------------------------------
build() {
  bold "3/4  Building the game (the first time takes a few minutes)"
  if [ ! -f /usr/share/sounds/sf2/FluidR3_GM.sf2 ] && command -v apt-get > /dev/null; then
    note "Optional: with the FluidR3 SoundFont the music plays on recorded instruments."
    echo "      sudo apt-get install -y fluid-soundfont-gm"
    ask "Install it? (130 MB; you can skip this)" && sudo apt-get install -y fluid-soundfont-gm || true
  fi
  tools/build.sh "${VARIANTS[@]}"
  ok "built: ${VARIANTS[*]}"
}

check_tools
sort_game_files
[ "$ONLY_FILES" = 1 ] && exit 0
build
bold "4/4  Done"
echo "  Start the game any time with:  ./play.sh"
if [ "$START" = 1 ]; then exec ./play.sh; fi
