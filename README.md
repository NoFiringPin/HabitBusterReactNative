# HabitBuster — React Native (Expo)

A React Native port of the Flutter `App_for_hand` app. It pairs with the
**FaceDefense gesture watch** (Adafruit QT Py ESP32‑S3 running the CircuitPython
firmware in `Assets/hardwareCode/code.py`) over **Bluetooth LE / Nordic UART
Service**, calibrates a behavior, and monitors for it live.

This is the **functional core**: BLE bridge + simulator, the
behavior → calibrate → monitor loop, and a live dashboard. The static
History / Achievements / Information / Settings / Profile screens from the
Flutter `main.dart` are intentionally deferred to a follow-up.

## The Bluetooth ↔ hardware contract

The RN app speaks the **exact** line protocol the firmware expects, so it
connects to the same watch the Flutter app did. See
[`src/services/twitchDevice.ts`](src/services/twitchDevice.ts) (`UartProtocol`)
and [`src/services/bleTwitchDevice.ts`](src/services/bleTwitchDevice.ts).

| | |
|---|---|
| Service UUID | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART) |
| RX (app → watch, write) | `6e400002-…` — newline-terminated ASCII, chunked to 20 bytes |
| TX (watch → app, notify) | `6e400003-…` — buffered and split on `\n` |
| Advertised name | `FaceDefense` (one-tap "Find my watch") |
| App → watch | `MODE IDLE\|CALIB\|RUN`, `CFG gate=… mth=… pmin=… pmax=…`, `ALERT 0\|1`, `PING` |
| Watch → app | `HELLO fw=… mode=…`, `DAT p=… r=… m=… f=…`, `EVT n=… p=… m=…`, `PONG` |

The calibration math (`src/services/calibration.ts`) and the on-device debounce
mirror (`src/services/mockTwitchDevice.ts`) are ported 1:1 from the Dart, so the
`CFG` profile the app pushes produces identical detection on the watch.

## Prerequisites

- Node 18+ and npm
- A physical iOS or Android device with Bluetooth (BLE is **not** available in
  simulators/emulators, and this app needs a **custom dev client** — plain Expo
  Go cannot load the native BLE module).
- Xcode (for iOS) or Android Studio + SDK (for Android) to build the dev client.

## Run it

```bash
npm install
npx expo prebuild            # generates the native ios/ and android/ projects
```

Then build & launch the dev client on a connected device:

```bash
npx expo run:android         # or: npx expo run:ios
```

Subsequent JS-only changes just need the bundler:

```bash
npm start                    # expo start --dev-client
```

### Without hardware

Tap **Use simulator** on the Connect screen. The full
calibrate → detect → alert loop runs entirely in-app (`MockTwitchDevice`), no
watch required.

## Building for iOS from Windows (EAS Build)

iOS binaries can only be compiled on macOS, so there is no local iOS build on
Windows. Instead, build in the cloud with **EAS Build** (runs on Apple hardware)
and install the result on a **physical iPhone** — required anyway, since BLE does
not work in the iOS Simulator.

**Requirement that can't be worked around:** a **paid Apple Developer account
($99/yr)** to code-sign a custom (BLE) dev client onto a real iPhone. A free
Apple ID only works via Xcode on a Mac.

The `development` profile in `eas.json` is preconfigured for this (dev client,
`ios.simulator: false`, internal distribution). From Windows PowerShell:

```bash
npx eas-cli login                                      # free Expo account
npx eas-cli build:configure                            # writes projectId into app.json
npx eas-cli device:create                              # register your iPhone (QR/URL)
npx eas-cli build --profile development --platform ios # cloud build; prompts for Apple login
```

When it finishes, open the returned URL/QR on the iPhone to install, then run
`npm start` on Windows and open the dev client — it loads JS from Metro over your
LAN. Test the real BLE watch connection there.

Prefer a standalone build with no computer attached? Use `--profile preview`
instead; it bundles the JS in (no Metro, no fast-refresh). EAS builds your project
from a clean cloud checkout, so the folder-path caveat below does **not** affect
EAS builds.

## ⚠️ Important: the folder path

This project currently lives under a parent folder named
`KevinL(gesture watch)` — the **parentheses and space can break native Gradle /
Xcode builds**. If `expo run:android` / `expo run:ios` fails with path errors,
move the project to a path with no spaces or parentheses, e.g.
`C:\dev\facedefense`, and re-run `npx expo prebuild`.

## Project map

| RN file | Ported from (Flutter) |
|---|---|
| `src/models/behaviorProfile.ts` | `lib/models/behavior_profile.dart` |
| `src/services/twitchDevice.ts` | `lib/services/twitch_device.dart` |
| `src/services/bleTwitchDevice.ts` | `lib/services/ble_twitch_device.dart` |
| `src/services/mockTwitchDevice.ts` | `lib/services/mock_twitch_device.dart` |
| `src/services/calibration.ts` | `lib/services/calibration.dart` |
| `src/services/alertService.ts` | `lib/services/alert_service.dart` |
| `src/state/appController.ts` | `lib/services/app_controller.dart` |
| `src/screens/DashboardScreen.tsx` | `lib/main.dart` (DashboardPage, condensed) |
| `src/screens/DeviceHubScreen.tsx` | `lib/screens/device_hub.dart` |
| `src/screens/ScanScreen.tsx` | `lib/screens/scan_screen.dart` |
| `src/screens/CalibrationWizard.tsx` | `lib/screens/calibration_wizard.dart` |
| `src/screens/MonitorScreen.tsx` | `lib/screens/monitor_screen.dart` |

## Library mapping

| Flutter | React Native |
|---|---|
| `flutter_blue_plus` | `react-native-ble-plx` |
| `shared_preferences` | `@react-native-async-storage/async-storage` |
| `HapticFeedback` / `SystemSound` | `expo-haptics` (tone dropped; add `expo-av` to restore) |
| `ChangeNotifier` + `ListenableBuilder` | singleton store + `useSyncExternalStore` |
| Navigator / MaterialPageRoute | `@react-navigation/native-stack` |
