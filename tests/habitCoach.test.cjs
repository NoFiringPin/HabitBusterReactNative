const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const stored = new Map();
let failNextWrite = false;
const storage = {
  getItem: async (key) => stored.get(key) ?? null,
  setItem: async (key, value) => {
    if (failNextWrite) { failNextWrite = false; throw new Error('Storage unavailable'); }
    stored.set(key, value);
  },
  removeItem: async (key) => { stored.delete(key); },
};
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/services/habitCoach.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, {
  module: moduleUnderTest, exports: moduleUnderTest.exports,
  require: (name) => {
    assert.equal(name, '@react-native-async-storage/async-storage');
    return storage;
  },
});
const { COACH_ACTIONS, recommendCoachAction, recordCoachFeedback, parseCoachHistory,
  loadCoachHistory, saveCoachFeedback, resetCoachHistory } = moduleUnderTest.exports;

test('new users get a context-suited action without a watch or saved feedback', () => {
  for (const moment of ['focused', 'restless', 'stressed']) {
    const result = recommendCoachAction({}, 'general', moment);
    assert.ok(result.action.moments.includes(moment));
    assert.equal(result.learned, false);
  }
});

test('unhelpful feedback changes the next suggestion and survives a reload', () => {
  const first = recommendCoachAction({}, 'nails', 'focused').action;
  const history = recordCoachFeedback({}, 'nails', 'focused', first.id, false);
  const restored = parseCoachHistory(JSON.stringify(history));
  const next = recommendCoachAction(restored, 'nails', 'focused');
  assert.notEqual(next.action.id, first.id);
  assert.equal(next.learned, true);
  assert.equal(Object.keys(restored).length, 1);
});

test('helpful feedback favors an action, with learning isolated by habit and moment', () => {
  let history = {};
  for (let i = 0; i < 8; i++) history = recordCoachFeedback(history, 'nails', 'focused', 'anchor', true);
  assert.equal(recommendCoachAction(history, 'nails', 'focused').action.id, 'anchor');
  assert.equal(recommendCoachAction(history, 'hair', 'focused').learned, false);
  assert.equal(recommendCoachAction(history, 'nails', 'restless').learned, false);
});

test('trying alternatives visits every action before starting over', () => {
  const seen = [];
  for (let i = 0; i < COACH_ACTIONS.length; i++) {
    const action = recommendCoachAction({}, 'general', 'restless', seen).action;
    assert.ok(!seen.includes(action.id));
    seen.push(action.id);
  }
  assert.ok(COACH_ACTIONS.some((action) => action.id === recommendCoachAction({}, 'general', 'restless', seen).action.id));
});

test('invalid saved data never creates fabricated learning', () => {
  for (const raw of [null, '{bad json', 'null', '[]', JSON.stringify({ a: { helpful: 5, tried: 1 }, b: { helpful: -1, tried: 2 }, c: { helpful: 0, tried: 1.5 } })]) {
    assert.equal(Object.keys(parseCoachHistory(raw)).length, 0);
  }
});

test('simultaneous ratings survive reload, failed saves can retry, and reset leaves tracking intact', async () => {
  stored.set('log', 'existing tracking history');
  await Promise.all([
    saveCoachFeedback('nails', 'focused', 'hands', true),
    saveCoachFeedback('hair', 'restless', 'cue', false),
  ]);
  let history = await loadCoachHistory();
  assert.equal(Object.keys(history).length, 2);
  assert.equal(history[JSON.stringify(['nails', 'focused', 'hands'])].helpful, 1);
  failNextWrite = true;
  await assert.rejects(saveCoachFeedback('nails', 'focused', 'hands', true));
  await saveCoachFeedback('nails', 'focused', 'hands', true);
  history = await loadCoachHistory();
  assert.equal(history[JSON.stringify(['nails', 'focused', 'hands'])].tried, 2);
  await resetCoachHistory();
  assert.equal(Object.keys(await loadCoachHistory()).length, 0);
  assert.equal(stored.get('log'), 'existing tracking history');
});
