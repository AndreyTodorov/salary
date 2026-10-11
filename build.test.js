const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const I18N = require('./i18n.js');

test('English and German text have the same keys', () => {
  assert.deepEqual(Object.keys(I18N.de).sort(), Object.keys(I18N.en).sort());
});
test('index.html and de/index.html are built from the current source', () => {
  execFileSync(process.execPath, [require.resolve('./build.js'), '--check'], { stdio: 'pipe' });
});
