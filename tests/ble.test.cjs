const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Run the real TypeScript service with just the native phone radio replaced.
function fixture(reply = 'PONG\n') {
  const service = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const writes = [];
  let monitor;
  let cancelled = 0;
  const peer = {
    id: 'watch', name: 'FaceDefense',
    discoverAllServicesAndCharacteristics: async () => peer,
    services: async () => [{
      uuid: service,
      characteristics: async () => [
        { uuid: service.replace('0001', '0002'), isWritableWithoutResponse: true },
        { uuid: service.replace('0001', '0003') },
      ],
    }],
    monitorCharacteristicForService: (_service, _tx, listener) => {
      monitor = listener;
      // Buffered replies and samples may arrive before we send our own PING.
      const timer = setTimeout(() => receive('PONG\nDAT p=1 r=2 m=3 f=0\n'), 20);
      return { remove: () => clearTimeout(timer) };
    },
    writeCharacteristicWithoutResponseForService: async (_service, _rx, value) => {
      writes.push(Buffer.from(value, 'base64').toString());
      if (reply) {
        // Notifications can split a line across packets.
        receive(reply.slice(0, 2));
        receive(reply.slice(2));
      }
    },
  };
  const receive = (line) => monitor(null, { value: Buffer.from(line).toString('base64') });
  const manager = {
    state: async () => 'PoweredOn',
    stopDeviceScan() {},
    onDeviceDisconnected: () => ({ remove() {} }),
    isDeviceConnected: async () => false,
    connectToDevice: async () => peer,
    cancelDeviceConnection: async () => { cancelled++; },
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
      module, exports: module.exports, setTimeout, clearTimeout,
      require: (name) => {
        if (name === 'react-native') return { Platform: { OS: 'ios' } };
        if (name === 'react-native-ble-plx') return {
          BleManager: function () { return manager; }, BleError: class extends Error {},
          State: { PoweredOn: 'PoweredOn' }, ScanMode: {},
        };
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
        return require(name);
      },
    }, { filename: file });
    return module.exports;
  }
  const api = load(path.resolve(__dirname, '../src/services/bleTwitchDevice.ts'));
  return { ...api, peer, writes, cancelled: () => cancelled, service };
}

test('automatic discovery excludes other and unnamed Adafruit UART devices', () => {
  const { isOurWatch, service } = fixture();
  assert.equal(isOurWatch({ name: 'FaceDefense', serviceUUIDs: [service] }), true);
  assert.equal(isOurWatch({ localName: 'facedefense' }), true);
  assert.equal(isOurWatch({ name: 'OtherApp', serviceUUIDs: [service] }), false);
  assert.equal(isOurWatch({ serviceUUIDs: [service] }), false);
  assert.equal(isOurWatch({ name: 'FaceDefenseOtherApp' }), false);
});

test('the current advertised name takes priority over the OS cached name', () => {
  const { isOurWatch } = fixture();
  assert.equal(isOurWatch({ name: 'FaceDefense', localName: 'OtherApp' }), false);
  assert.equal(isOurWatch({ name: 'OtherApp', localName: 'FaceDefense' }), true);
  assert.equal(isOurWatch({ name: 'FaceDefense', localName: '' }), true);
});

test('a first connection sends PING and accepts a fragmented PONG', async () => {
  const f = fixture();
  const device = new f.BleTwitchDevice(f.peer);
  await device.connect({ maxAttempts: 1 });
  assert.deepEqual(f.writes, ['PING\n']);
  assert.equal(device.connection, 'connected');
  await device.disconnect();
});

test('unsolicited samples and unrelated UART text cannot pass verification', async () => {
  const f = fixture('hello from another Adafruit project\n');
  const device = new f.BleTwitchDevice(f.peer);
  await assert.rejects(device.connect({ maxAttempts: 1 }), /data channel did not respond/);
  assert.ok(f.writes.length > 0, 'must try the write channel despite incoming samples');
  assert.equal(device.connection, 'disconnected');
  assert.equal(f.cancelled(), 1, 'failed link is cancelled');
  device.dispose();
});
