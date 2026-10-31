const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(name) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/services/', name + '.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Date });
  return exports;
}
const { HabitRewards, HABIT_BADGES } = load('habitRewards');
const { buildShieldReport, dayKey } = load('shieldReport');
const start = 1_700_000_000_000;
const hour = 3_600_000;
const logEntry = (total) => ({ total, hours: new Array(24).fill(0) });

test('all hour/day badge thresholds unlock exactly once', () => {
  const rewards = new HabitRewards();
  rewards.start('nails', start);
  for (const badge of HABIT_BADGES) {
    assert.equal(rewards.update(start + badge.ms - 1), false);
    assert.equal(rewards.progress('nails').earned[badge.id], undefined);
    assert.equal(rewards.update(start + badge.ms), true);
    assert.ok(rewards.progress('nails').earned[badge.id]);
    assert.equal(rewards.update(start + badge.ms), false);
  }
  assert.equal(Object.keys(rewards.progress('nails').earned).length, 7);
});

test('pauses freeze progress and touches reset progress without removing badges', () => {
  const rewards = new HabitRewards();
  rewards.start('nails', start);
  rewards.stop(start + hour / 2);
  rewards.update(start + 24 * hour);
  assert.equal(rewards.progress('nails').cleanMs, hour / 2);
  rewards.start('nails', start + 24 * hour);
  rewards.update(start + 24.5 * hour);
  assert.ok(rewards.progress('nails').earned['1h']);
  rewards.detected(start + 24.5 * hour);
  assert.equal(rewards.progress('nails').cleanMs, 0);
  assert.ok(rewards.progress('nails').earned['1h']);
});

test('progress persists per behavior and an app restart cannot credit offline time', () => {
  const rewards = new HabitRewards();
  rewards.start('nails', start);
  rewards.stop(start + hour);
  rewards.start('skin', start + hour);
  rewards.update(start + 1.5 * hour);
  const restored = new HabitRewards();
  restored.restore(rewards.serialize());
  restored.update(start + 200 * hour);
  assert.equal(restored.progress('nails').cleanMs, hour);
  assert.equal(restored.progress('skin').cleanMs, hour / 2);
  assert.equal(restored.progress('skin').earned['1h'], undefined);
});

test('invalid reward storage and a backwards clock do not create progress', () => {
  const rewards = new HabitRewards();
  for (const raw of ['null', '{invalid', '{}', '[["nails", {"cleanMs": -1, "earned": {"1h": "yes"}}]]']) {
    rewards.restore(raw);
    assert.equal(rewards.progress('nails').cleanMs, 0);
    assert.equal(Object.keys(rewards.progress('nails').earned).length, 0);
  }
  rewards.start('nails', start);
  rewards.update(start - hour);
  assert.equal(rewards.progress('nails').cleanMs, 0);
});

test('weekly reports start Monday and distinguish zero-touch, missing, and future days', () => {
  const log = new Map([['2026-10-26', logEntry(0)], ['2026-10-28', logEntry(6)], ['2026-11-01', logEntry(99)]]);
  const report = buildShieldReport(log, 'week', 0, new Date(2026, 9, 31));
  assert.equal(dayKey(report.start), '2026-10-26');
  assert.equal(dayKey(report.end), '2026-11-01');
  assert.equal(report.total, 6);
  assert.equal(report.recordedDays, 2);
  assert.equal(report.average, 3);
  assert.equal(report.days[0].recorded, true);
  assert.equal(report.days[1].recorded, false);
  assert.equal(report.days[6].future, true);
  assert.equal(report.days[6].recorded, false);
});

test('monthly reports handle leap years and year boundaries without date overflow', () => {
  const now = new Date(2024, 2, 31);
  const feb = buildShieldReport(new Map(), 'month', -1, now);
  assert.equal(feb.days.length, 29);
  assert.equal(dayKey(feb.start), '2024-02-01');
  assert.equal(dayKey(feb.end), '2024-02-29');
  assert.equal(feb.average, null);
  const december = buildShieldReport(new Map(), 'month', -1, new Date(2026, 0, 31));
  assert.equal(dayKey(december.start), '2025-12-01');
  assert.equal(december.days.length, 31);
});

test('Sunday and daylight-saving weeks contain seven distinct calendar days', () => {
  for (const now of [new Date(2026, 10, 1), new Date(2026, 2, 8)]) {
    const report = buildShieldReport(new Map(), 'week', 0, now);
    assert.equal(report.start.getDay(), 1);
    assert.equal(report.end.getDay(), 0);
    assert.equal(new Set(report.days.map((day) => day.key)).size, 7);
    const previous = buildShieldReport(new Map(), 'week', -1, now);
    assert.ok(previous.end < report.start);
  }
});
