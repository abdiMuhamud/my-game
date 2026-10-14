# Mwizi! Mombasa

A street-chase runner set in Mombasa: chase Kibaka from Likoni Ferry through Moi Avenue, Marikiti,
Mji wa Kale, Fort Jesus and Nyali Bridge to Bamburi Beach.

## Download

- Android app: [apk/mwizi-mombasa.apk](https://github.com/abdiMuhamud/my-game/raw/main/apk/mwizi-mombasa.apk)
- Share video: [video/mwizi-mombasa.mp4](https://github.com/abdiMuhamud/my-game/raw/main/video/mwizi-mombasa.mp4)

The APK is a debug build for direct install (allow "install unknown apps" on the phone).

## Develop

```bash
npm install
npm run serve   # play in a browser at http://localhost:5173
npm run video   # re-render the share video
npm run apk     # rebuild the APK (JDK 21 + Android SDK; Linux or Git Bash)
```

The game lives in `www/` (three.js, no build step). `android/` is the Capacitor wrapper.

### Linux builds

The APK script also supports Linux with JDK 21 and an Android SDK containing
`platforms;android-35` and build tools 34/35. Set `ANDROID_HOME` to the SDK and
run `npm run apk`. It syncs Capacitor in a temporary copy, builds the debug APK,
runs the Android unit tests, and copies the result to `apk/mwizi-mombasa.apk`.
For sandboxed workspaces, use writable `GRADLE_USER_HOME`, `ANDROID_USER_HOME`,
and a writable Java user home via `JAVA_TOOL_OPTIONS=-Duser.home=/path/to/home`.
Gradle needs the environment's HTTP/HTTPS proxy configured in its user
`gradle.properties` when direct networking is unavailable.

Video recording uses software rendering on Linux. To use system Chromium in
an isolated container that cannot provide Chromium's sandbox:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium MWIZI_NO_SANDBOX=1 npm run video
```

The output is `video/mwizi-mombasa.mp4` (1080 × 1920, 30 fps, with music).
APK and video files must be rebuilt after editing `www/`; changing the browser
game does not update previously downloaded files. Debug APKs are for direct
testing, not Play Store publication. A build signed with a different debug key
requires uninstalling the previous build first, which removes its local scores.

## Credits

Character models by Quaternius (CC0). Fonts: Lilita One and Nunito (SIL Open Font License).
