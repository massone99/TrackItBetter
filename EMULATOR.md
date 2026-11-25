# Emulator

## The Lite AVD

Use the lightweight AVD `Lite` instead of the stock medium AVDs. It targets an S26 Ultra aspect
ratio (720x1560 @320dpi = 360x780 dp), runs software GPU (`swiftshader_indirect`), boots with no
snapshot, no audio, and no boot animation, so it starts fast and leaves CPU/RAM for Metro and Gradle.

Launch it through the `emu-lite` launcher (it already passes the right flags):

```sh
emu-lite
```

Equivalent to:

```sh
~/Android/Sdk/emulator/emulator -avd Lite -gpu swiftshader_indirect -no-snapshot -no-audio -no-boot-anim
```

Do not start `Lite` with the bare `emulator -avd Lite` command or with the default AVDs unless a
different form factor is explicitly required.

## Always hot reload when possible

Fast Refresh is the default workflow. Keep one Metro server running for the whole session and let it
push JS/TS changes into the running app instead of rebuilding or relaunching anything.

```sh
npx expo start
# then press "a" once to install/open the dev build on the Lite emulator
```

Rules:

- **JS/TS-only change** (components, hooks, styles, screens, strings): save the file and let Fast
  Refresh apply it. Do not restart Metro, reinstall the APK, or reboot the emulator. Do not run
  `expo run:android` again.
- **State got lost or Fast Refresh can't apply the change** (new module graph, provider changes,
  navigation reset): trigger a full JS reload from the Metro terminal with `r` (or `adb shell input
  keyevent 82` → Reload). This still keeps the emulator and the installed app.
- **Native change** (new native dependency, `app.json`/plugins touching native config, Gradle,
  `android/` sources, patches): only then rebuild with `npm run android`. Reboot the emulator only
  if the rebuild requires it.
- Never leave Metro stopped between edits, and never reinstall the APK (`adb install`, `npm run
  android`, `npm run build:apk`) just to see a JS change.
- After each visual change, confirm the result on the Lite emulator before reporting the task done;
  if the change touches an input, open the keyboard and verify nothing is covered.

## Useful commands

```sh
adb devices                          # confirm Lite is the only target
adb shell input keyevent 82          # open the dev menu (Reload / Dev settings)
adb logcat -s ReactNativeJS          # JS logs while the app is running
adb reverse tcp:8081 tcp:8081        # only if Metro is unreachable from the emulator
```

If Metro and the emulator drift out of sync (stale bundle, Fast Refresh stopped working), restart
Metro once with cache clear (`npx expo start --clear`), not the emulator.
