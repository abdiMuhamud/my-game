#!/usr/bin/env bash
# Builds apk/mwizi-mombasa.apk.  Run from Git Bash: bash tools/build-apk.sh
# The build happens in a short-path copy because Windows refuses to start the Android
# tools from very deep folders (CreateProcess error 267).
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
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
