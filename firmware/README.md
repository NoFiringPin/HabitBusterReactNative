# Watch firmware (CircuitPython, BLE)

`code.py` here is the **BLE edition** of the gesture-watch firmware — the one the
HabitBuster app connects to. Use this maintained copy when updating the watch.

> ⚠️ **Do not flash the `code.py` in the parent `KevinL(gesture watch)` folder.**
> That one is the older **prototype with no Bluetooth** — no `BLERadio`, no
> `UARTService`, no advertising. A watch running it drives the LED and prints to
> the serial console but **cannot connect to any phone app.** If the watch isn't
> connecting, check which file is installed and flash **this** file if needed.

Which one is loaded? Open the board's `CIRCUITPY` drive and look at `code.py`,
or check the serial console on boot:
- BLE edition prints: `Twitch Watch (BLE) starting. fw = 2  mode = ...`
- Prototype prints:  `Twitch Watch starting.  CALIBRATION_MODE = ...`

## Hardware
- **Board:** Adafruit QT Py ESP32-S3 (on-board NeoPixel = the indicator)
- **Sensor:** Adafruit LSM6DSOX 6-DoF IMU over STEMMA QT / I²C

## Flashing
1. Install CircuitPython on the QT Py ESP32-S3 if it isn't already (the board
   mounts as a `CIRCUITPY` USB drive).
2. Copy the required libraries into `CIRCUITPY/lib/` from the matching
   [Adafruit CircuitPython bundle](https://circuitpython.org/libraries):
   - `neopixel.mpy`
   - `adafruit_lsm6ds/` (folder)
   - `adafruit_bus_device/` (folder)
   - `adafruit_ble/` (folder) ← required for Bluetooth
3. Copy **this `code.py`** to the root of `CIRCUITPY` (replacing any existing
   `code.py`). It runs automatically on save/reboot.

On boot the NeoPixel shows status: **green** = idle, **blue** = calibrating,
**red** = a twitch was flagged, **orange (blinking)** = the IMU wasn't found
(check the STEMMA QT cable). Bluetooth remains available while sensor setup
retries once per second; a Bluetooth connection alone does not prove the sensor
is working. Live readings must also arrive in the app.

No serial console or Mu session is needed to start the firmware. The UART UUID
is sent in the main advertising packet and `FaceDefense` in its scan response,
keeping both within the 31-byte limit. Advertising restarts from the radio's
actual state after disconnects, including very brief failed connections.

## The app ↔ firmware contract (must stay in lock-step)

The app finds the watch by advertised name and speaks a newline-delimited ASCII
protocol over the Nordic UART Service. These must match the app's
`src/services/twitchDevice.ts` (`UartProtocol`):

| | Value |
|---|---|
| Advertised name | `FaceDefense` (`DEVICE_NAME` in `code.py`) |
| Service UUID | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (NUS) |
| RX — app→watch (write) | `6e400002-…` |
| TX — watch→app (notify) | `6e400003-…` |
| App → watch | `MODE IDLE\|CALIB\|RUN`, `CFG gate=… mth=… pmin=… pmax=…`, `ALERT 0\|1`, `PING` |
| Watch → app | `HELLO fw=… mode=…`, `DAT p=… r=… m=… f=…`, `EVT n=… p=… m=…`, `PONG` |

## Other Adafruit boards nearby

Nordic UART is shared by many Adafruit projects. **Find my watch** requires the
exact name `FaceDefense` (case-insensitive), rather than selecting the first
UART peripheral. A current scan-response name takes priority over the phone's
cached name. Keep your other projects' different names; no changes to them or
their pairings are needed. If you rename this watch, change `DEVICE_NAME` and
the app's `UartProtocol.deviceName` together.

Unnamed UART devices remain visible under **Choose manually** for diagnosing
older firmware, but are never automatically selected. The app must receive
`PONG` in response to `PING` before reporting a working connection; arbitrary
UART text, `HELLO`, and sensor samples no longer pass that check. This checks
protocol compatibility, not secure device authentication.

## Cold-start acceptance check (physical hardware)

1. Copy the updated `code.py` and matching libraries to `CIRCUITPY`. Close Mu,
   safely eject the drive, then fully remove and restore board power. Leave
   the serial console closed throughout this test.
2. Open the updated app in a **development build** on a physical phone (BLE
   requires native code and cannot run in Expo Go). For a first-install test,
   use a clean test installation; uninstalling deletes saved local profiles.
   Grant the Bluetooth/Nearby Devices permission when prompted.
3. Leave a differently named Adafruit UART device advertising nearby (and,
   separately, test with it connected to its own app). Tap **Find my watch**.
   HabitBuster should select only `FaceDefense`, verify the connection, and
   display changing live readings as you move the watch. The other device's
   app connection should remain intact.
4. Disconnect/reconnect several times, then force-close/reopen HabitBuster and
   reconnect. Repeat a full watch power cycle. None should require a Mu reset.
5. With the watch off and only your other Adafruit board on, **Find my watch**
   should report that it cannot find the watch, without connecting to that board.

## Not connecting? Checklist

- **Firmware startup:** check the installed file first. For diagnosis only,
  open the serial console and capture the traceback or boot messages *before*
  manually restarting. Opening Mu must not be a normal startup step. A board
  left at the `>>>` prompt is not running `code.py`; exit the REPL with Ctrl-D.
  Also check that a custom `boot.py` is not waiting for a serial connection.
- **Advertising:** the expected message is
  `Advertising as 'FaceDefense' (service + name scan response) - waiting for app`.
  `start_advertising FAILED (retrying): ...` means the firmware retries every
  second. Capture repeated errors and the CircuitPython version. Missing
  libraries or safe mode can prevent `code.py` from reaching Bluetooth setup.
- **Sensor:** orange blinking means sensor setup is retrying. Check the cable,
  power, and libraries. Do not treat a successful Bluetooth link without live
  readings as a successful watch test.
- **Already connected elsewhere:** this firmware advertises when no peer is
  connected. Disconnect this watch from its other central/app before scanning.
- **Permission:** if denied, enable Bluetooth/Nearby Devices for HabitBuster in
  phone Settings. Connect inside HabitBuster, not the system pairing screen.

Developer checks: `npm run typecheck`, `node --test tests/ble.test.cjs`, and
`python -m unittest discover -s tests -p "test_firmware.py"`. The automated
checks use simulated hardware; complete the physical checks above as well.
