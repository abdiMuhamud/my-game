#!/usr/bin/env bash
# Builds apk/mwizi-mombasa.apk on Linux or Windows Git Bash.
# The build happens in a short-path copy because Windows refuses to start the Android
# tools from very deep folders (CreateProcess error 267).
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" == Linux* ]]; then
  : "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
  if [[ -z "$ANDROID_HOME" || ! -d "$ANDROID_HOME/platforms/android-35" ]]; then
    echo 'Set ANDROID_HOME to an Android SDK with platform 35 and build tools installed.' >&2
    exit 1
  fi
  # Build in a fresh staging directory so Capacitor leaves source files alone.
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/mwizi-android.XXXXXX")"
  echo "Android build staging: $WORK"
  cp -r "$HERE/android" "$HERE/www" "$HERE/capacitor.config.json" "$HERE/package.json" "$WORK/"
  ln -s "$HERE/node_modules" "$WORK/node_modules"
  cd "$WORK"
  "$HERE/node_modules/.bin/cap" sync android
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
  cd android
  bash gradlew assembleDebug testDebugUnitTest --no-daemon --max-workers=2
  mkdir -p "$HERE/apk"
  cp app/build/outputs/apk/debug/app-debug.apk "$HERE/apk/mwizi-mombasa.apk"
  echo "Built $HERE/apk/mwizi-mombasa.apk"
  exit 0
fi
ANDROID="$LOCALAPPDATA/Android"
WORK="${MWIZI_BUILD_DIR:-$ANDROID/build/mwizi}"
export JAVA_HOME="$(cygpath -w "$ANDROID/jdk-21")"
export PATH="$ANDROID/jdk-21/bin:$PATH"

cd "$HERE"
npx cap sync android
mkdir -p "$WORK/node_modules"
rm -rf "$WORK/android" "$WORK/www" "$WORK/node_modules/@capacitor"
cp -r android www capacitor.config.json package.json "$WORK/"
cp -r node_modules/@capacitor "$WORK/node_modules/"
rm -rf "$WORK/android/app/build" "$WORK/android/build" "$WORK/android/.gradle"
echo "sdk.dir=$(cygpath -m "$ANDROID/Sdk")" > "$WORK/android/local.properties"

cd "$WORK/android"
./gradlew.bat assembleDebug --no-daemon -q
mkdir -p "$HERE/apk"
cp app/build/outputs/apk/debug/app-debug.apk "$HERE/apk/mwizi-mombasa.apk"
ls -la "$HERE/apk"
