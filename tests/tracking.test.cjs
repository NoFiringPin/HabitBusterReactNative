const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function fixture() {
  const stored = new Map();
  const calls = { buzz: 0, plays: 0, seeks: 0, players: 0, modes: [], alerts: [] };
  let connectionListener, eventListener;
  const device = {
    name: 'FaceDefense', connection: 'disconnected',
    onConnection: (fn) => { connectionListener = fn; return () => {}; },
    onSample: () => () => {},
    onEvent: (fn) => { eventListener = fn; return () => {}; },
    connect: async () => { device.connection = 'connected'; connectionListener('connected'); },
    disconnect: async () => { device.connection = 'disconnected'; connectionListener('disconnected'); },
    pushProfile: async () => {},
    setAlertEnabled: async (enabled) => {
      assert.equal(device.connection, 'connected');
      calls.alerts.push(enabled);
    },
    setMode: async (mode) => { calls.modes.push(mode); },
    dispose() {},
  };
  const player = {
    isLoaded: true,
    seekTo: async (position) => { assert.equal(position, 0); calls.seeks++; },
    play: () => { calls.plays++; },
    pause() {}, remove() {},
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
      module, exports: module.exports, console, Date,
      setTimeout, clearTimeout, setInterval, clearInterval,
      require: (name) => {
        if (name === '@react-native-async-storage/async-storage') return {
          getItem: async (key) => stored.get(key) ?? null,
          setItem: async (key, value) => { stored.set(key, value); },
        };
        if (name === 'react-native') return { Vibration: {
          vibrate: () => { calls.buzz++; }, cancel() {},
        } };
        if (name === 'expo-haptics') return {
          notificationAsync: async () => {}, impactAsync: async () => {},
          NotificationFeedbackType: {}, ImpactFeedbackStyle: {},
        };
        if (name === 'expo-audio') return {
          createAudioPlayer: () => { calls.players++; return player; },
          setAudioModeAsync: async (mode) => {
            assert.equal(mode.playsInSilentMode, false);
            assert.equal(mode.shouldPlayInBackground, false);
          },
        };
        if (name.endsWith('/bleTwitchDevice')) return {
          BleTwitchDevice: function () { return device; },
        };
        if (name.endsWith('.wav')) return 1;
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
        return require(name);
      },
    }, { filename: file });
    return module.exports;
  }
  const { AppController } = load(path.resolve(__dirname, '../src/state/appController.ts'));
  const c = new AppController();
  return {
    c, calls, stored, player, device,
    connect: async () => {
      await c.useBleDevice({});
      c.profiles = [{ id: 'test', name: 'Test behavior' }];
      c.activeProfileId = 'test';
      await c.connect();
    },
    event: () => eventListener({ count: 1, pitch: 30, motion: 2, time: Date.now() }),
  };
}

test('passive tracking counts and saves events without phone or watch alerts', async () => {
  const f = fixture();
  try {
    await f.c.setPassiveTracking(true); // Preference can be changed offline.
    await f.connect();
    await f.c.startMonitoring();
    f.event();
    assert.equal(f.c.todayCount, 1);
    assert.equal(f.c.recentEvents.length, 1);
    assert.equal(Object.values(JSON.parse(f.stored.get('log')))[0].total, 1);
    assert.equal(f.calls.buzz, 0);
    assert.equal(f.calls.plays, 0);
    assert.deepEqual(f.calls.alerts, [false, false]);
    assert.equal(f.calls.modes.at(-1), 'run');
    await f.c.stopMonitoring();
    f.event();
    assert.equal(f.c.todayCount, 1, 'paused events must not be counted');
    assert.equal(f.calls.modes.at(-1), 'idle');
  } finally { f.c.alerts.dispose(); }
});

test('saved passive and sound preferences are reapplied on reconnect', async () => {
  const f = fixture();
  try {
    f.stored.set('alertEnabled', '0');
    f.stored.set('soundEnabled', '1');
    await f.c.init();
    assert.equal(f.c.passiveTracking, true);
    assert.equal(f.c.alerts.soundEnabled, true);
    await f.connect();
    await f.c.startMonitoring();
    await f.c.disconnect();
    assert.equal(f.c.monitoring, false);
    await f.c.connect();
    assert.equal(f.calls.alerts.at(-1), false);
    assert.equal(f.c.monitoring, false, 'reconnect waits for explicit Start');
    await f.c.setPassiveTracking(false);
    assert.equal(f.calls.alerts.at(-1), true);
    assert.equal(f.stored.get('alertEnabled'), '1');
  } finally { f.c.alerts.dispose(); }
});

test('calibration stops the tracking session and previews do not inflate counts', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.c.startMonitoring(), /Connect your watch/);
    await f.connect();
    await f.c.startMonitoring();
    await f.c.enterCalibration();
    f.event();
    assert.equal(f.c.monitoring, false);
    assert.equal(f.c.todayCount, 0);
  } finally { f.c.alerts.dispose(); }
});

test('sound reuses one player, restarts each chime, and stays muted in passive mode', async () => {
  const f = fixture();
  try {
    await f.c.setSoundEnabled(true);
    await f.c.alerts.trigger();
    await f.c.alerts.trigger();
    assert.equal(f.calls.players, 1);
    assert.equal(f.calls.plays, 2);
    assert.equal(f.calls.seeks, 2);
    await f.c.setPassiveTracking(true);
    await f.c.alerts.trigger();
    assert.equal(f.calls.plays, 2);
    assert.equal(f.calls.buzz, 2);
    await f.c.alerts.testSound();
    assert.equal(f.calls.plays, 3, 'explicit test can play while passive');
    assert.equal(f.c.passiveTracking, true);
  } finally { f.c.alerts.dispose(); }
});

test('switching to passive mode cancels sound waiting for its initial load', async () => {
  const f = fixture();
  let loaded;
  f.player.isLoaded = false;
  f.player.addListener = (_event, callback) => {
    loaded = () => { f.player.isLoaded = true; callback({ isLoaded: true }); };
    return { remove() {} };
  };
  try {
    f.c.alerts.soundEnabled = true;
    const pending = f.c.alerts.trigger();
    await new Promise(setImmediate);
    assert.equal(typeof loaded, 'function');
    await f.c.setPassiveTracking(true);
    loaded();
    await pending;
    assert.equal(f.calls.plays, 0);
  } finally { f.c.alerts.dispose(); }
});

test('the bundled chime is a short mono PCM WAV', () => {
  const wav = fs.readFileSync(path.resolve(__dirname, '../assets/alert.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  assert.ok(wav.readUInt32LE(40) / wav.readUInt32LE(28) < 0.5);
});
