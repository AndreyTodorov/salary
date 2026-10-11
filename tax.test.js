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
test('13th salary at 3000', () => {
  const r = pap({ STKL: 1, RE4: 300000, JRE4: 3600000, SONSTB: 300000 });
  assert.equal(r.STS, 66400);
  assert.equal(r.SOLZS, 0);
});
test('13th salary at 5000 with church', () => {
  const r = pap({ STKL: 1, RE4: 500000, R: 1, JRE4: 6000000, SONSTB: 500000 });
  assert.equal(r.STS, 138300);
  assert.equal(r.SOLZS, 0);
  assert.equal(r.BKS, 138300);
});
test('13th salary at 8000 has Soli without Milderung', () => {
  const r = pap({ STKL: 1, RE4: 800000, JRE4: 9600000, SONSTB: 800000 });
  assert.equal(r.STS, 314900);
  assert.equal(r.SOLZS, 17319);
});
test('no bonus means no bonus tax', () => {
  const r = pap({ STKL: 1, RE4: 500000, JRE4: 6000000, SONSTB: 0 });
  assert.deepEqual([r.STS, r.SOLZS, r.BKS], [0, 0, 0]);
});

const S = (o) => ({ ...T.DEFAULTS, ...o });

test('net at 5000, class I, childless, average Zusatzbeitrag', () => {
  const r = T.calculate(S({ thirteenth: false }), 500000);
  assert.equal(r.regular.incomeTax, 78241);
  assert.equal(r.regular.health + r.regular.care + r.regular.pension + r.regular.unemployment, 108750);
  assert.equal(r.regular.net, 313009);
});
test('net at 3000 and 8000', () => {
  assert.equal(T.calculate(S(), 300000).regular.net, 205442);
  const r = T.calculate(S(), 800000).regular;
  assert.deepEqual([r.health, r.care, r.pension, r.unemployment], [50859, 13950, 74400, 10400]);
  assert.equal(r.net, 467996);
});
test('13th salary at 8000: no KV/PV, RV/ALV on 4950 only', () => {
  const b = T.calculate(S(), 800000).bonus;
  assert.deepEqual([b.health, b.care], [0, 0]);
  assert.equal(b.pension, 46035);   // 4950 * 9.3 %
  assert.equal(b.unemployment, 6435);
  assert.equal(b.incomeTax, 314900);
  assert.equal(b.soli, 17319);
});
test('year and average include the 13th salary', () => {
  const r = T.calculate(S(), 500000);
  assert.equal(r.year.gross, 6500000);
  assert.equal(r.year.net, r.regular.net * 12 + r.bonus.net);
  assert.equal(r.average.gross, 541667);
  assert.equal(r.november.net, r.regular.net + r.bonus.net);
});
test('13th off: bonus is zero and average equals regular', () => {
  const r = T.calculate(S({ thirteenth: false }), 500000);
  assert.equal(r.bonus.gross, 0);
  assert.equal(r.average.net, r.regular.net);
});
test('church tax 9 % in Berlin, 8 % in Bavaria', () => {
  const be = T.calculate(S({ church: true, thirteenth: false }), 500000).regular;
  const by = T.calculate(S({ church: true, state: 'BY', thirteenth: false }), 500000).regular;
  assert.equal(be.church, 7041); // 782.41 * 9 %
  assert.equal(by.church, 6259);
});
test('care insurance: Saxony, children discount, under 23', () => {
  const care = (o) => T.calculate(S(o), 500000).regular.care;
  assert.equal(care({}), 12000);                           // 2.4 %
  assert.equal(care({ state: 'SN' }), 14500);              // 2.9 %
  assert.equal(care({ children: 3 }), 6500);               // 1.8 - 0.5 = 1.3 %
  assert.equal(care({ age: 22 }), 9000);                   // 1.8 %
});
test('private insurance: employee pays premium minus subsidy', () => {
  const r = T.calculate(S({ insurance: 'private', privatePremium: 80000 }), 800000).regular;
  assert.equal(r.health, 40000);
  assert.equal(r.care, 0);
  const cap = T.calculate(S({ insurance: 'private', privatePremium: 150000 }), 800000).regular;
  assert.equal(cap.health, 150000 - 61322);
});
test('notes for midijob range and private below JAEG', () => {
  assert.ok(T.calculate(S(), 150000).notes.length > 0);
  assert.ok(T.calculate(S({ insurance: 'private' }), 500000).notes.length > 0);
  assert.equal(T.calculate(S(), 500000).notes.length, 0);
});
test('gross 0 is finite', () => {
  const r = T.calculate(S(), 0);
  assert.equal(r.year.net, 0);
  assert.ok(Object.values(r.regular).every(Number.isFinite));
});

test('solve monthly net back to gross', () => {
  const g = T.solve(S({ thirteenth: false }), 'monthlyNet', 313009);
  assert.ok(Math.abs(g - 500000) <= 20, `got ${g}`);
  assert.ok(Math.abs(T.calculate(S({ thirteenth: false }), g).regular.net - 313009) <= 1);
});
test('solve every field round-trips within a cent', () => {
  const s = S({ church: true, children: 1, taxClass: 3 });
  const truth = T.calculate(s, 654321);
  for (const f of T.FIELDS) {
    const target = T.read(truth, f);
    const got = T.read(T.calculate(s, T.solve(s, f, target)), f);
    assert.ok(Math.abs(got - target) <= 1, `${f}: ${got} vs ${target}`);
  }
});
test('yearly gross with 13th divides by 13', () => {
  assert.equal(T.solve(S(), 'yearGross', 6500000), 500000);
});
test('solver clamps unreachable and negative targets', () => {
  assert.equal(T.solve(S(), 'monthlyNet', 1e12), T.MAX_GROSS);
  assert.equal(T.solve(S(), 'monthlyNet', 0), 0);
});
test('parseAmount accepts German and English formats', () => {
  assert.equal(T.parseAmount('5.000,50'), 500050);
  assert.equal(T.parseAmount('5000.50'), 500050);
  assert.equal(T.parseAmount('5.000'), 500000);
  assert.equal(T.parseAmount('65.000'), 6500000);
  assert.equal(T.parseAmount('1.234.567'), 123456700);
  assert.equal(T.parseAmount('5 000 €'), 500000);
  assert.equal(T.parseAmount('5,000.50'), 500050);
  assert.equal(T.parseAmount('4999,9'), 499990);
  assert.equal(T.parseAmount(''), null);
  assert.equal(T.parseAmount('abc'), null);
  assert.equal(T.parseAmount('-5'), null);
});

test('private subsidy cap is lower in Saxony (care 1.3 % employer share)', () => {
  const r = T.calculate(S({ insurance: 'private', privatePremium: 130000, state: 'SN' }), 800000).regular;
  assert.equal(r.health, 130000 - (50859 + 7556));
  assert.equal(T.pkvSubsidy(S({ insurance: 'private', privatePremium: 130000, state: 'SN' })), 58415);
});
test('restore ignores invalid saved state', () => {
  const bad = T.restore({ settings: { taxClass: 7, insurance: 'x', state: 'XX', age: 'old', children: -1,
    church: 'yes', thirteenth: 1, zusatzbeitrag: NaN, privatePremium: -5 }, anchor: { field: 'yearNet', cents: 'abc' } });
  assert.deepEqual(bad.settings, T.DEFAULTS);
  assert.equal(bad.anchor, null);
  const good = T.restore({ settings: { taxClass: 3, state: 'SN', church: true }, anchor: { field: 'yearNet', cents: 5000000 } });
  assert.deepEqual(good.settings, { ...T.DEFAULTS, taxClass: 3, state: 'SN', church: true });
  assert.deepEqual(good.anchor, { field: 'yearNet', cents: 5000000 });
  assert.deepEqual(T.restore(null), { settings: T.DEFAULTS, anchor: null });
});

test('class V/VI tariff branches above W1, W2 and W3', () => {
  const cases = [[5, 200000, 29800, 0], [5, 600000, 162425, 0], [5, 2000000, 740850, 40746],
    [5, 3000000, 1190708, 65488], [6, 2000000, 745458, 41000], [6, 3000000, 1195458, 65750]];
  for (const [STKL, RE4, lst, soli] of cases) {
    const r = pap({ STKL, RE4 });
    assert.deepEqual([r.LSTLZZ, r.SOLZLZZ], [lst, soli], `class ${STKL}, ${RE4}`);
  }
});
test('class III Soli with doubled Freigrenze', () => {
  const r = pap({ STKL: 3, RE4: 1500000 });
  assert.deepEqual([r.LSTLZZ, r.SOLZLZZ], [380466, 4914]);
});
test('13th salary tax in classes III, V and VI', () => {
  const sts = (STKL) => pap({ STKL, RE4: 500000, JRE4: 6000000, SONSTB: 500000 }).STS;
  assert.deepEqual([sts(3), sts(5), sts(6)], [104800, 167600, 167700]);
  const hi = pap({ STKL: 3, RE4: 1500000, JRE4: 18000000, SONSTB: 1500000 });
  assert.deepEqual([hi.STS, hi.SOLZS], [630000, 34650]);
});
test('Y exposes the tax year', () => assert.equal(T.Y.YEAR, 2026));
