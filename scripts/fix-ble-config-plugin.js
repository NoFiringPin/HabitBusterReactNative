const fs = require('node:fs');
const path = require('node:path');

// react-native-ble-plx 3.5.1 imports an undeclared, internal Expo package.
// Expo SDK 55+ exposes the same API from this stable public entry point.
// Keep this idempotent so it is safe on every local and EAS install.
const pluginDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-ble-plx',
  'plugin',
  'build',
);

if (!fs.existsSync(pluginDir)) {
  console.log('BLE config-plugin fix skipped: react-native-ble-plx is not installed.');
  process.exit(0);
}

let patchedFiles = 0;

for (const fileName of fs.readdirSync(pluginDir)) {
  if (!fileName.endsWith('.js') && !fileName.endsWith('.d.ts')) continue;

  const filePath = path.join(pluginDir, fileName);
  const source = fs.readFileSync(filePath, 'utf8');
  const patched = source.replaceAll('@expo/config-plugins', 'expo/config-plugins');

  if (patched !== source) {
    fs.writeFileSync(filePath, patched);
    patchedFiles += 1;
  }
}

console.log(
  patchedFiles > 0
    ? `Applied BLE config-plugin compatibility fix to ${patchedFiles} files.`
    : 'BLE config-plugin compatibility fix is already applied.',
);
