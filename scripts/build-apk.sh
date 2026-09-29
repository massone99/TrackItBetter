#!/usr/bin/env bash
# Builds a sideloadable release APK into build/<AppName>-<version>.apk.
#
# The name and version come from app.json (expo.name, expo.version); bump them with
# `npm run version:bump -- patch|minor|major|<x.y.z>`, never by hand.
#
# By default it targets arm64-v8a only (every modern phone) and stores native libs compressed,
# which keeps the APK a fraction of the all-ABI size. Override the ABIs with ABIS, e.g.
#   ABIS=armeabi-v7a,arm64-v8a scripts/build-apk.sh
set -euo pipefail

cd "$(dirname "$0")/.."

ABIS="${ABIS:-arm64-v8a}"
NAME=$(node -p "require('./app.json').expo.name")
VERSION=$(node -p "require('./app.json').expo.version")
VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode")

# android/ is generated; regenerate it so app.json changes are always picked up.
CI=1 npx expo prebuild -p android --clean

# Native build caches live inside node_modules and survive prebuild --clean. Stale ones make CMake
# link against libraries from a previous configuration ("libworklets.so ... missing").
rm -rf node_modules/*/android/.cxx node_modules/@*/*/android/.cxx \
  node_modules/*/android/build node_modules/@*/*/android/build

# lintVital runs out of memory with Gradle's default 2 GB heap and adds nothing to a sideloaded APK.
(
  cd android
  ./gradlew assembleRelease \
    -PreactNativeArchitectures="$ABIS" \
    -Pexpo.useLegacyPackaging=true \
    "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m" \
    -x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease
)

mkdir -p build
OUT="build/$NAME-$VERSION.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "APK: $OUT ($(du -h "$OUT" | cut -f1), $ABIS, versionCode $VERSION_CODE)"
