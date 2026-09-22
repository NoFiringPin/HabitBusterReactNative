"""Execute code.py with simulated CircuitPython hardware; no board required."""
from pathlib import Path
import types
import unittest
from unittest.mock import patch


class StopSimulation(BaseException):
    pass


def simulate(sensor_failures=0, adv_failures=0, drop_advertising=False,
             connect=False, read_failure=False):
    state = types.SimpleNamespace(tick=0, probes=0, starts=[], writes=[], events=[])

    class Radio:
        connected = False
        advertising = False

        def start_advertising(self, advertisement, scan_response=None):
            state.events.append('advertise')
            state.starts.append(state.tick)
            if len(state.starts) <= adv_failures:
                raise RuntimeError('radio busy')
            # Both packets must fit, and the name must not be omitted.
            assert len(bytes(advertisement)) <= 31
            assert len(scan_response) <= 31
            assert b'FaceDefense' in scan_response
            self.advertising = True

        def stop_advertising(self):
            self.advertising = False

    radio = Radio()

    class Advertisement:
        complete_name = ''

        def __bytes__(self):
            name = self.complete_name.encode()
            return bytes([len(name) + 1, 9]) + name if name else b''

    class ServiceAdvertisement(Advertisement):
        def __init__(self, uart):
            pass

        def __bytes__(self):
            # Flags + a 128-bit UUID AD structure.
            return b'\x02\x01\x06' + bytes([17, 7]) + bytes(16) + super().__bytes__()

    class UART:
        pending = b''

        @property
        def in_waiting(self):
            return len(self.pending)

        def read(self, count):
            data, self.pending = self.pending[:count], self.pending[count:]
            return data

        def write(self, data):
            state.writes.append(data)

    uart = UART()

    class Sensor:
        @property
        def acceleration(self):
            if read_failure and state.tick == 2:
                raise OSError('temporary bus failure')
            return (0.0, 0.0, 9.8)

        gyro = (0.0, 0.0, 0.0)

    def sensor(_bus):
        state.events.append('sensor')
        state.probes += 1
        if state.probes <= sensor_failures:
            raise OSError('sensor still starting')
        return Sensor()

    def sleep(_seconds):
        state.tick += 1
        if drop_advertising and state.tick == 2:
            # A connect/disconnect entirely between firmware iterations.
            radio.advertising = False
        if connect and state.tick == 1:
            radio.connected = True
            radio.advertising = False
            uart.pending = b'CFG mth=bad\nPING\n'
        if state.tick == 20:
            raise StopSimulation()

    modules = {
        'time': types.SimpleNamespace(monotonic=lambda: state.tick * 0.25, sleep=sleep),
        'board': types.SimpleNamespace(NEOPIXEL=1, NEOPIXEL_POWER=2, STEMMA_I2C=object),
        'digitalio': types.SimpleNamespace(DigitalInOut=lambda _: types.SimpleNamespace(),
                                          Direction=types.SimpleNamespace(OUTPUT=1)),
        'neopixel': types.SimpleNamespace(NeoPixel=lambda *a, **kw: [None]),
        'microcontroller': types.SimpleNamespace(nvm=None),
        'adafruit_lsm6ds': types.ModuleType('adafruit_lsm6ds'),
        'adafruit_lsm6ds.lsm6dsox': types.SimpleNamespace(LSM6DSOX=sensor),
        'adafruit_ble': types.SimpleNamespace(BLERadio=lambda: radio),
        'adafruit_ble.advertising': types.SimpleNamespace(Advertisement=Advertisement),
        'adafruit_ble.advertising.standard': types.SimpleNamespace(
            ProvideServicesAdvertisement=ServiceAdvertisement),
        'adafruit_ble.services': types.ModuleType('adafruit_ble.services'),
        'adafruit_ble.services.nordic': types.SimpleNamespace(UARTService=lambda: uart),
    }
    filename = Path(__file__).resolve().parents[1] / 'firmware' / 'code.py'
    with patch.dict('sys.modules', modules), patch('builtins.print'):
        try:
            exec(compile(filename.read_text(encoding='utf-8'), str(filename), 'exec'), {})
        except StopSimulation:
            pass
    return state


class FirmwareTests(unittest.TestCase):
    def test_cold_boot_advertises_before_sensor_and_recovers_probe(self):
        state = simulate(sensor_failures=2, connect=True)
        self.assertEqual(state.events[0], 'advertise')
        self.assertEqual(state.probes, 3)
        self.assertIn(b'PONG\n', state.writes)
        self.assertTrue(any(line.startswith(b'DAT ') for line in state.writes))

    def test_brief_connection_cannot_leave_advertising_stopped(self):
        state = simulate(drop_advertising=True)
        self.assertEqual(state.starts, [0, 2])

    def test_radio_failure_retries_with_backoff(self):
        state = simulate(adv_failures=2)
        self.assertEqual(state.starts, [0, 4, 8])

    def test_missing_sensor_keeps_ble_responsive_without_fake_samples(self):
        state = simulate(sensor_failures=100, connect=True)
        self.assertIn(b'PONG\n', state.writes)
        self.assertFalse(any(line.startswith(b'DAT ') for line in state.writes))
        self.assertEqual(state.probes, 5)

    def test_sensor_read_failure_recovers_without_stopping_ble(self):
        state = simulate(connect=True, read_failure=True)
        self.assertEqual(state.probes, 2)
        self.assertTrue(any(line.startswith(b'DAT ') for line in state.writes))


if __name__ == '__main__':
    unittest.main()
