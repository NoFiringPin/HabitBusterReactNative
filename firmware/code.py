# ============================================================================
#  Twitch / BFRB "Gesture Watch"  -  BLE edition  (CircuitPython)
# ----------------------------------------------------------------------------
#  Board  : Adafruit QT Py ESP32-S3 (on-board NeoPixel used as the indicator)
#  Sensor : Adafruit LSM6DSOX + LIS3MDL 9-DoF IMU, over STEMMA QT / I2C
#  Mount  : worn on the wrist like a smart-watch
#
#  WHAT'S NEW vs the standalone prototype
#  --------------------------------------
#  The watch now pairs with the FaceDefense phone app over Bluetooth LE using
#  the Nordic UART Service (NUS). The app does the *calibration* (recording your
#  resting vs. gesture motion) and sends the watch a detection PROFILE. The
#  watch stores that profile and runs recognition ON-DEVICE, so it keeps working
#  even when the phone is away. It reports live data and confirmed twitch events
#  back to the app.
#
#  Three modes, driven by the app:
#     IDLE  (green) : connected, not detecting. Minimal chatter.
#     CALIB (blue)  : streams live samples fast so the app can measure you.
#     RUN   (green/red): applies the active profile, flags twitches, alerts.
#
#  The active profile is also saved to NVM, so after a reboot the watch reloads
#  your last behavior and can detect standalone before the app reconnects.
#
#  LINE PROTOCOL over NUS (newline-terminated ASCII)
#  -------------------------------------------------
#     App -> watch:
#        MODE IDLE|CALIB|RUN
#        CFG gate=<0|1> mth=<f> pmin=<f> pmax=<f>
#        ALERT <0|1>
#        PING
#     Watch -> app:
#        HELLO fw=1 mode=<str>
#        DAT p=<pitch> r=<roll> m=<motion> f=<0|1>
#        EVT n=<count> p=<pitch> m=<motion>
#        PONG
#
#  LIBRARIES NEEDED (copy into CIRCUITPY/lib/ from the Adafruit bundle):
#     - neopixel.mpy
#     - adafruit_lsm6ds/            (folder)
#     - adafruit_bus_device/        (folder)
#     - adafruit_ble/               (folder)   <-- NEW, for Bluetooth
#
#  HOW TO USE
#  ----------
#   1. Flash this as code.py, copy the libraries above into /lib.
#   2. Open the FaceDefense app, go to Device & Behaviors -> Connect a device,
#      and pick this watch (it advertises as "FaceDefense").
#   3. Add a behavior and follow the calibration wizard. The app measures you
#      and pushes a profile; the watch starts detecting.
# ============================================================================

import time
import math
import struct
import board
import digitalio
import neopixel

try:
    import microcontroller  # for NVM persistence
except ImportError:
    microcontroller = None

from adafruit_lsm6ds.lsm6dsox import LSM6DSOX

from adafruit_ble import BLERadio
from adafruit_ble.advertising import Advertisement
from adafruit_ble.advertising.standard import ProvideServicesAdvertisement
from adafruit_ble.services.nordic import UARTService

FW_VERSION = 2

# The app finds the watch by this exact name (single-tap connect, no hunting).
# Must match `UartProtocol.deviceName` in src/services/twitchDevice.ts.
DEVICE_NAME = "FaceDefense"

# ============================================================================
#  DEFAULT PROFILE  (overwritten by the app's CFG, or by NVM on boot)
# ============================================================================

profile = {
    "gate": True,      # require the "face zone" tilt as well as motion
    "mth": 1.2,        # motion-energy threshold (rad/s)
    "pmin": 20.0,      # face-zone pitch window (degrees)
    "pmax": 90.0,
}

# --- Timing / debounce (seconds) --------------------------------------------
FLAG_ON_TIME  = 0.35   # gesture must persist this long before flagging
FLAG_OFF_TIME = 0.60   # must stay clear this long before clearing
MIN_RED_TIME  = 1.00   # once flagged, hold red at least this long

# --- Filter responsiveness (0..1) -------------------------------------------
GRAVITY_ALPHA = 0.10
MOTION_ALPHA  = 0.35

# --- Loop + LED -------------------------------------------------------------
LOOP_DELAY     = 0.02   # ~50 Hz sampling
LED_BRIGHTNESS = 0.30

COLOR_IDLE    = (0, 255, 0)     # green
COLOR_FLAGGED = (255, 0, 0)     # red
COLOR_CALIB   = (0, 0, 255)     # blue
COLOR_ERROR   = (255, 80, 0)    # orange (sensor not found)

alert_enabled = True   # gates the on-device red LED alert (not the app's)

# ============================================================================
#  NVM PERSISTENCE  (survives reboot so the watch runs standalone)
# ============================================================================
#  Layout: magic byte 0x7C, gate(1 byte), mth/pmin/pmax as little-endian floats.
_NVM_MAGIC = 0x7C
_NVM_FMT = "<BBfff"
_NVM_LEN = struct.calcsize(_NVM_FMT)


def save_profile():
    if microcontroller is None or microcontroller.nvm is None:
        return
    try:
        packed = struct.pack(
            _NVM_FMT, _NVM_MAGIC,
            1 if profile["gate"] else 0,
            profile["mth"], profile["pmin"], profile["pmax"],
        )
        microcontroller.nvm[0:_NVM_LEN] = packed
    except Exception:  # noqa: keep running even if NVM write fails
        pass


def load_profile():
    """Load a saved profile from NVM. Returns True if one was found."""
    if microcontroller is None or microcontroller.nvm is None:
        return False
    try:
        raw = bytes(microcontroller.nvm[0:_NVM_LEN])
        magic, gate, mth, pmin, pmax = struct.unpack(_NVM_FMT, raw)
        if magic == _NVM_MAGIC:
            profile["gate"] = bool(gate)
            profile["mth"] = mth
            profile["pmin"] = pmin
            profile["pmax"] = pmax
            return True
    except Exception:  # noqa: no saved profile yet / bad data
        pass
    return False


# ============================================================================
#  HARDWARE SETUP
# ============================================================================

try:
    npx_power = digitalio.DigitalInOut(board.NEOPIXEL_POWER)
    npx_power.direction = digitalio.Direction.OUTPUT
    npx_power.value = True
except AttributeError:
    pass

pixel = neopixel.NeoPixel(board.NEOPIXEL, 1,
                          brightness=LED_BRIGHTNESS, auto_write=True)


# Start Bluetooth even when the sensor is still powering up. A failed first
# I2C probe must not require a serial-console reload to make the watch visible.
i2c = None
imu = None
next_sensor_retry = 0.0
sensor_error_printed = False


# ============================================================================
#  HELPERS
# ============================================================================

def magnitude(x, y, z):
    return math.sqrt(x * x + y * y + z * z)


def pitch_roll_from_gravity(gx, gy, gz):
    pitch = math.degrees(math.atan2(-gx, math.sqrt(gy * gy + gz * gz)))
    roll = math.degrees(math.atan2(gy, gz))
    return pitch, roll


def handle_command(line):
    """Parse one app -> watch line and apply it."""
    global mode, alert_enabled
    line = line.strip()
    if not line:
        return
    parts = line.split()
    tag = parts[0]
    fields = {}
    for kv in parts[1:]:
        if "=" in kv:
            k, v = kv.split("=", 1)
            fields[k] = v

    if tag == "MODE" and len(parts) > 1:
        want = parts[1]
        if want in ("IDLE", "CALIB", "RUN"):
            set_mode(want)
    elif tag == "CFG":
        if "gate" in fields:
            profile["gate"] = fields["gate"] == "1"
        if "mth" in fields:
            profile["mth"] = float(fields["mth"])
        if "pmin" in fields:
            profile["pmin"] = float(fields["pmin"])
        if "pmax" in fields:
            profile["pmax"] = float(fields["pmax"])
        save_profile()
    elif tag == "ALERT" and len(parts) > 1:
        alert_enabled = parts[1] == "1"
    elif tag == "PING":
        send("PONG")


def send(line):
    if ble.connected:
        try:
            uart.write((line + "\n").encode("utf-8"))
        except Exception:  # noqa: peer may have dropped mid-write
            pass


def set_mode(new_mode):
    global mode, state, entry_true_since, hold_false_since
    mode = new_mode
    # Reset the detector whenever the mode changes.
    state = STATE_NORMAL
    entry_true_since = None
    hold_false_since = None


# ============================================================================
#  STATE
# ============================================================================

grav_x = grav_y = grav_z = None
motion = 0.0

STATE_NORMAL, STATE_FLAGGED = 0, 1
state = STATE_NORMAL
entry_true_since = None
hold_false_since = None
flagged_since = 0.0
flag_count = 0

last_dat = 0.0
rx_buffer = ""

# If a profile was saved, start detecting right away so the watch is useful
# standalone (e.g. after a reboot, before the phone reconnects).
mode = "RUN" if load_profile() else "IDLE"

# ============================================================================
#  BLE SETUP
# ============================================================================

ble = BLERadio()
# The watch's GAP name; the phone reads this after connecting, and it's the
# name the app matches on when it fits in the advertisement.
ble.name = DEVICE_NAME
uart = UARTService()

# Flags + NUS UUID take 21 bytes; adding the full name would take 34 (>31).
# Keep the service in the advertisement and the name in the scan response.
# Neither packet depends on a previous phone cache or a serial connection.
advertisement = ProvideServicesAdvertisement(uart)
scan_response = Advertisement()
scan_response.complete_name = DEVICE_NAME

was_connected = False
adv_error_printed = False
next_adv_retry = 0.0

print("Twitch Watch (BLE) starting. fw =", FW_VERSION, " mode =", mode)


# ============================================================================
#  MAIN LOOP  (detection always runs; BLE is managed non-blockingly)
# ============================================================================

while True:
    now = time.monotonic()

    # --- 0) Manage the BLE link without stalling detection ------------------
    if ble.connected:
        if ble.advertising:
            try:
                ble.stop_advertising()
            except Exception:  # noqa
                pass
        if not was_connected:
            was_connected = True
            rx_buffer = ""
            send("HELLO fw={} mode={}".format(FW_VERSION, mode))
    else:
        was_connected = False
        rx_buffer = ""
        # Read the radio state rather than a local flag: a brief connection can
        # stop advertising and disconnect again between two loop iterations.
        if not ble.advertising and now >= next_adv_retry:
            try:
                ble.start_advertising(advertisement, scan_response=bytes(scan_response))
                adv_error_printed = False
                print("Advertising as '{}' (service + name scan response) - waiting for app"
                      .format(DEVICE_NAME))
            except Exception as e:  # noqa: radio may still be busy after disconnect
                next_adv_retry = now + 1.0
                if not adv_error_printed:
                    print("start_advertising FAILED (retrying):", e)
                    adv_error_printed = True

    # --- 1) Drain any incoming commands (newline-delimited) -----------------
    if ble.connected and uart.in_waiting:
        try:
            rx_buffer += uart.read(uart.in_waiting).decode("utf-8")
        except Exception:  # noqa: ignore malformed bytes
            rx_buffer = ""
        while "\n" in rx_buffer:
            line, rx_buffer = rx_buffer.split("\n", 1)
            try:
                handle_command(line)
            except (ValueError, OverflowError) as e:
                print("Invalid command:", e)

    # --- 2) Read the sensor -------------------------------------------------
    if imu is None and now >= next_sensor_retry:
        next_sensor_retry = now + 1.0
        try:
            if i2c is None:
                try:
                    i2c = board.STEMMA_I2C()
                except AttributeError:
                    i2c = board.I2C()
            imu = LSM6DSOX(i2c)
            sensor_error_printed = False
        except Exception as e:
            if not sensor_error_printed:
                print("LSM6DSOX unavailable (retrying) -- check STEMMA QT:", e)
                sensor_error_printed = True
    if imu is None:
        pixel[0] = COLOR_ERROR if int(now / 0.3) % 2 == 0 else (0, 0, 0)
        time.sleep(LOOP_DELAY)
        continue
    try:
        ax, ay, az = imu.acceleration
        gx, gy, gz = imu.gyro
    except OSError as e:
        print("Sensor read failed (retrying):", e)
        imu = None
        grav_x = grav_y = grav_z = None
        motion = 0.0
        set_mode(mode)
        next_sensor_retry = now + 1.0
        time.sleep(LOOP_DELAY)
        continue

    # --- 3) Orientation -----------------------------------------------------
    if grav_x is None:
        grav_x, grav_y, grav_z = ax, ay, az
    else:
        grav_x = GRAVITY_ALPHA * ax + (1 - GRAVITY_ALPHA) * grav_x
        grav_y = GRAVITY_ALPHA * ay + (1 - GRAVITY_ALPHA) * grav_y
        grav_z = GRAVITY_ALPHA * az + (1 - GRAVITY_ALPHA) * grav_z

    pitch, roll = pitch_roll_from_gravity(grav_x, grav_y, grav_z)
    in_face_zone = profile["pmin"] <= pitch <= profile["pmax"]

    # --- 4) Motion energy ---------------------------------------------------
    gyro_mag = magnitude(gx, gy, gz)
    motion = MOTION_ALPHA * gyro_mag + (1 - MOTION_ALPHA) * motion
    motion_active = motion > profile["mth"]

    # --- 5) Candidate + debounce (only meaningful in RUN) -------------------
    # Two separate conditions:
    #   entry  : what it takes to START flagging -- a deliberate move (motion),
    #            plus the face-zone tilt when the orientation gate is on.
    #   hold   : what it takes to STAY flagged. For a face-zone behavior (e.g.
    #            nail biting) the hand PARKED at the mouth is the problem, even
    #            with no motion -- so we hold the flag while it's in the zone
    #            and only clear once the wrist leaves the zone. For motion-only
    #            behaviors we hold while there's still movement.
    if profile["gate"]:
        entry_candidate = motion_active and in_face_zone
        hold_condition = in_face_zone
    else:
        entry_candidate = motion_active
        hold_condition = motion_active

    # How long the ENTRY condition has been continuously true.
    if entry_candidate:
        if entry_true_since is None:
            entry_true_since = now
    else:
        entry_true_since = None

    # How long the HOLD condition has been continuously FALSE.
    if hold_condition:
        hold_false_since = None
    elif hold_false_since is None:
        hold_false_since = now

    flagged_now = False
    if mode == "RUN":
        if state == STATE_NORMAL:
            if entry_true_since is not None and (now - entry_true_since) >= FLAG_ON_TIME:
                state = STATE_FLAGGED
                flagged_since = now
                flag_count += 1
                send("EVT n={} p={:.0f} m={:.2f}".format(flag_count, pitch, motion))
        else:
            held = now - flagged_since
            cleared = (hold_false_since is not None
                       and (now - hold_false_since) >= FLAG_OFF_TIME)
            if cleared and held >= MIN_RED_TIME:
                state = STATE_NORMAL
        flagged_now = state == STATE_FLAGGED

    # --- 6) Drive the LED ---------------------------------------------------
    if mode == "CALIB":
        pixel[0] = COLOR_CALIB
    elif flagged_now and alert_enabled:
        pixel[0] = COLOR_FLAGGED
    else:
        pixel[0] = COLOR_IDLE

    # --- 7) Stream live samples ---------------------------------------------
    # Fast in CALIB (for the wizard), slower in RUN/IDLE to save airtime.
    dat_period = 0.05 if mode == "CALIB" else 0.15
    if (now - last_dat) >= dat_period:
        last_dat = now
        send("DAT p={:.1f} r={:.1f} m={:.2f} f={}".format(
            pitch, roll, motion, 1 if flagged_now else 0))

    time.sleep(LOOP_DELAY)
