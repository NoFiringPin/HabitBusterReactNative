const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const exportsFixture = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/services/motionVisualization.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { exports: exportsFixture });
const { angleDelta, isFreshSample, motionBuckets, motionScale } = exportsFixture;
const sample = { pitch: 30, roll: 10, motion: 0.5, flagged: false };

test('orientation crosses the roll seam without a full visual spin', () => {
  assert.equal(angleDelta(-179, 179), 2);
  assert.equal(angleDelta(179, -179), -2);
  assert.equal(angleDelta(45, 30), 15);
  assert.equal(angleDelta(-179, 539), 2);
});

test('missing, stale, future, and invalid readings are never presented as live', () => {
  assert.equal(isFreshSample(sample, 1000, 1000), true);
  assert.equal(isFreshSample(sample, 1000, 3500), true);
  assert.equal(isFreshSample(sample, 1000, 3501), false);
  assert.equal(isFreshSample(null, 1000, 1000), false);
  assert.equal(isFreshSample(sample, null, 1000), false);
  assert.equal(isFreshSample(sample, 2000, 1000), false);
  assert.equal(isFreshSample({ ...sample, motion: Infinity }, 1000, 1000), false);
  assert.equal(isFreshSample({ ...sample, pitch: NaN }, 1000, 1000), false);
});

test('motion chart preserves timestamp gaps, peaks, and detection state', () => {
  const buckets = motionBuckets([
    { time: 1000, motion: 10, flagged: false }, // outside the window
    { time: 6000, motion: 0.2, flagged: false },
    { time: 6100, motion: 0.8, flagged: true }, // same time bucket, keep peak
    { time: 14000, motion: 0.3, flagged: false },
    { time: 16000, motion: 8, flagged: true }, // future reading
    { time: 14000, motion: NaN, flagged: true },
  ], 15000, 10);
  assert.equal(buckets.length, 10);
  assert.equal(buckets.filter(Boolean).length, 2);
  assert.equal(buckets[1].motion, 0.8);
  assert.equal(buckets[1].flagged, true);
  assert.equal(buckets[9].motion, 0.3);
  assert.equal(buckets[9].flagged, false);
  assert.equal(buckets[5], null, 'missing time remains a gap');
});

test('chart scale stays finite and supports zero or invalid calibration thresholds', () => {
  assert.equal(motionScale(0, []), 0.1);
  assert.equal(motionScale(NaN, []), 0.1);
  assert.equal(motionScale(2, []), 3.2);
  assert.equal(motionScale(2, [{ time: 1, motion: 8, flagged: false }]), 8);
  assert.equal(motionScale(0, [{ time: 1, motion: Infinity, flagged: false }]), 0.1);
});
