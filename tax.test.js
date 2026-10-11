const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./tax.js');

// Reference values from the BMF test interface (bmf-steuerrechner.de, LSt2026ext), monthly, KVZ 2.90.
const base = { KVZ: 2.9, PVZ: 1 };
const pap = (o) => T.pap({ ...base, ...o });

test('class I, 3000', () => {
  const r = pap({ STKL: 1, RE4: 300000 });
  assert.equal(r.LSTLZZ, 29308);
  assert.equal(r.SOLZLZZ, 0);
});
test('class I, 5000', () => assert.equal(pap({ STKL: 1, RE4: 500000 }).LSTLZZ, 78241));
test('class I, 8000 with Soli Milderung', () => {
  const r = pap({ STKL: 1, RE4: 800000 });
  assert.equal(r.LSTLZZ, 181033);
  assert.equal(r.SOLZLZZ, 1362);
});
test('class I, 12000 full Soli', () => {
  const r = pap({ STKL: 1, RE4: 1200000 });
  assert.equal(r.LSTLZZ, 347275);
  assert.equal(r.SOLZLZZ, 19100);
});
test('class I, 5000, not childless', () => assert.equal(pap({ STKL: 1, RE4: 500000, PVZ: 0 }).LSTLZZ, 79258));
test('class I, 5000, one child, church', () => {
  const r = pap({ STKL: 1, RE4: 500000, PVZ: 0, ZKF: 1, R: 1 });
  assert.equal(r.LSTLZZ, 79258);
  assert.equal(r.BK, 52925);
});
test('class II, 5000, one child, church', () => {
  const r = pap({ STKL: 2, RE4: 500000, PVZ: 0, ZKF: 1, R: 1 });
  assert.equal(r.LSTLZZ, 67425);
  assert.equal(r.BK, 42291);
});
test('class III, 5000', () => assert.equal(pap({ STKL: 3, RE4: 500000 }).LSTLZZ, 40183));
test('class IV, 5000', () => assert.equal(pap({ STKL: 4, RE4: 500000 }).LSTLZZ, 78241));
test('class V, 3000', () => assert.equal(pap({ STKL: 5, RE4: 300000 }).LSTLZZ, 62566));
test('class VI, 3000', () => assert.equal(pap({ STKL: 6, RE4: 300000 }).LSTLZZ, 66500));
test('class I, 8000, private insurance 600 / subsidy 300', () => {
  const r = pap({ STKL: 1, RE4: 800000, PKV: 1, PKPV: 60000, PKPVAGZ: 30000 });
  assert.equal(r.LSTLZZ, 194916);
  assert.equal(r.SOLZLZZ, 3014);
});
test('gross 0 gives no tax', () => {
  const r = pap({ STKL: 1, RE4: 0 });
  assert.deepEqual([r.LSTLZZ, r.SOLZLZZ], [0, 0]);
});
