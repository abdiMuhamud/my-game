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
npm run apk     # rebuild the APK (needs JDK 21 and the Android SDK, run from Git Bash)
```

The game lives in `www/` (three.js, no build step). `android/` is the Capacitor wrapper.

## Credits

Character models by Quaternius (CC0). Fonts: Lilita One and Nunito (SIL Open Font License).
