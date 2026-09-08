# Watch firmware (CircuitPython, BLE)

`code.py` here is the **BLE edition** of the gesture-watch firmware — the one the
HabitBuster app connects to. It's a copy of
`App_for_hand/Assets/hardwareCode/code.py`, dropped in this repo so it's easy to
find and flash while testing the app.

> ⚠️ **Do not flash the `code.py` in the parent `KevinL(gesture watch)` folder.**
> That one is the older **prototype with no Bluetooth** — no `BLERadio`, no
> `UARTService`, no advertising. A watch running it drives the LED and prints to
> the serial console but **cannot connect to any phone app.** If the watch isn't
> connecting, it is almost certainly running that prototype. Flash **this** file
> instead.

Which one is loaded? Open the board's `CIRCUITPY` drive and look at `code.py`,
or check the serial console on boot:
- BLE edition prints: `Twitch Watch (BLE) starting. fw = 1  mode = ...`
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
(check the STEMMA QT cable).

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

## Not connecting? Checklist
0. **Is it actually advertising?** After the boot line, the serial console must
   print one of:
   - `Advertising as 'FaceDefense' (name+service) - waiting for app`
   - `Advertising (service only, unnamed) - waiting for app` ← normal on the
     QT Py ESP32-S3, whose radio can't fit the name + 128-bit UUID in one packet
   - `start_advertising FAILED: ...` ← the radio refused; power-cycle the board
   If you see **no** "Advertising" line at all, the watch is not broadcasting and
   no scanner can see it. (An older build of this firmware swallowed the
   advertising error silently — re-flash this copy, which prints it and falls
   back to a service-only advertisement that always fits.)
1. **Right firmware?** Confirm the boot line says `(BLE) starting` (see above).
2. **Powered & advertising?** The watch advertises whenever no phone is
   connected. In the app tap **Find my watch** (scans for name `FaceDefense`) or
   **Choose manually** to see all nearby BLE devices — the watch should appear.
3. **iOS GATT cache.** iOS caches BLE services aggressively. After re-flashing,
   toggle the iPhone's Bluetooth off/on (or forget/re-scan) so it re-reads the
   service.
4. **Already connected elsewhere?** A BLE peripheral serves one central at a
   time. If it's still connected to another phone/Mac, it won't advertise.
5. **Bluetooth permission.** First launch must be granted the Bluetooth prompt;
   if denied, enable it in iOS Settings → HabitBuster.
