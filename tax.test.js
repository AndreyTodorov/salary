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
    assert.ok(got >= target && got - target <= 15, `${f}: ${got} vs ${target}`);
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
  assert.deepEqual(T.restore(null), { settings: T.DEFAULTS, anchor: null, lang: null });
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
test('notes are codes and count the 13th salary', () => {
  const codes = (o, g) => T.calculate(S(o), g).notes.map((n) => n.code);
  assert.deepEqual(codes({ insurance: 'private' }, 600000), []);            // 78,000 a year incl. 13th
  assert.deepEqual(codes({ insurance: 'private', thirteenth: false }, 600000), ['jaeg']);
  assert.deepEqual(codes({}, 190000), []);                                  // average 2,058.33
  assert.deepEqual(codes({ thirteenth: false }, 190000), ['midijob']);
  assert.deepEqual(T.calculate(S({ thirteenth: false }), 190000).notes[0], { code: 'midijob', limit: 200000 });
});
test('benefit card up to 50 € is tax-free and not part of net', () => {
  const base = T.calculate(S({ thirteenth: false }), 500000).regular;
  const r = T.calculate(S({ thirteenth: false, benefitCard: 5000 }), 500000);
  assert.equal(r.regular.net, base.net);
  assert.equal(r.regular.benefit, 5000);
  assert.equal(r.year.benefit, 60000);
  assert.deepEqual(r.notes, []);
});
test('benefit card above 50 € is taxed in full', () => {
  const r = T.calculate(S({ thirteenth: false, benefitCard: 6000 }), 500000);
  const asPay = T.calculate(S({ thirteenth: false }), 506000).regular;
  assert.equal(r.regular.incomeTax, asPay.incomeTax);
  assert.equal(r.regular.pension, asPay.pension);
  assert.equal(r.regular.net, asPay.net - 6000);
  assert.deepEqual(r.notes.map((n) => n.code), ['benefitTaxable']);
});
test('13th salary is one monthly gross, without the benefit card', () => {
  const r = T.calculate(S({ benefitCard: 6000 }), 500000);
  assert.equal(r.bonus.gross, 500000);
  assert.equal(r.bonus.benefit, 0);
});
test('benefit card above 50 € counts toward the §23a room', () => {
  // 8,400 + 60 = 8,460 > RV cap 8,450: no room left for the 13th salary in RV/ALV
  const b = T.calculate(S({ benefitCard: 6000 }), 840000).bonus;
  assert.equal(b.pension, 0);
});
test('solver returns the lowest gross reaching at least the target', () => {
  const s = S();
  const g = T.solve(s, 'yearNet', 5000000);
  const at = (x) => T.calculate(s, x).year.net;
  assert.ok(at(g) >= 5000000);
  assert.ok(at(g - 1) < 5000000);
});
test('solver crosses the Soli threshold on the 13th salary', () => {
  const s = S({ taxClass: 2, insurance: 'private', children: 6, age: 20 });
  assert.equal(T.solve(s, 'yearNet', 7575203), 943896);
});
test('solver is fast enough for typing', () => {
  const s = S({ church: true, children: 2 });
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) T.solve(s, 'averageNet', 300000 + i * 50000);
  assert.ok((performance.now() - t0) / 10 < 25);
});
test('parseAmount reads English thousands and rejects bad grouping', () => {
  assert.equal(T.parseAmount('65,000'), 6500000);
  assert.equal(T.parseAmount('1,234,567'), 123456700);
  assert.equal(T.parseAmount('5,50'), 550);
  assert.equal(T.parseAmount('5.'), 500);
  assert.equal(T.parseAmount('5000.123'), null);
  assert.equal(T.parseAmount('50.00.0'), null);
  assert.equal(T.parseAmount('1,2,3'), null);
});
test('class 2 needs a child', () => {
  assert.equal(T.normalize(S({ taxClass: 2, children: 0 })).taxClass, 1);
  assert.equal(T.normalize(S({ taxClass: 2, children: 1 })).taxClass, 2);
});
test('restore validates benefit card and language', () => {
  const r = T.restore({ settings: { benefitCard: 5000, taxClass: 2, children: 0 }, lang: 'de' });
  assert.equal(r.settings.benefitCard, 5000);
  assert.equal(r.settings.taxClass, 1);
  assert.equal(r.lang, 'de');
  const bad = T.restore({ settings: { benefitCard: -1 }, lang: 'fr' });
  assert.equal(bad.settings.benefitCard, 0);
  assert.equal(bad.lang, null);
});
test('restore keeps old saved state', () => {
  const r = T.restore({ settings: { taxClass: 3, state: 'BY', church: true, age: 41 }, anchor: { field: 'monthlyNet', cents: 400000 } });
  assert.deepEqual(r.settings, { ...T.DEFAULTS, taxClass: 3, state: 'BY', church: true, age: 41 });
  assert.deepEqual(r.anchor, { field: 'monthlyNet', cents: 400000 });
});
test('states carry German names', () => {
  assert.deepEqual(T.STATES.find(([c]) => c === 'BY'), ['BY', 'Bavaria', 'Bayern']);
  assert.ok(T.STATES.every((s) => s.length === 3));
});

const SB = (o) => S({ summerBonus: true, summerMode: 'percent', summerPercent: 50, summerMonth: 6, ...o });

test('summer bonus is taxed as a one-off payment; the 13th counts it as already paid (BMF)', () => {
  const r = T.calculate(SB({ church: true }), 500000);
  assert.equal(r.summer.gross, 250000);
  assert.equal(r.summer.incomeTax, 68400);
  assert.equal(r.bonus.incomeTax, 141100);
  const hi = T.calculate(SB(), 800000);
  assert.deepEqual([hi.summer.incomeTax, hi.summer.soli], [152400, 8382]);
  assert.deepEqual([hi.bonus.incomeTax, hi.bonus.soli], [330500, 18177]);
});
test('summer bonus uses the contribution room up to its month; the 13th gets the rest', () => {
  // 5,700 €/month leaves 112.50 €/month under the KV cap: June room 675, November room 1,237.50 − 675
  const r = T.calculate(SB({ summerPercent: 100 }), 570000);
  assert.equal(r.summer.health, 5906);  // 675 × 8.75 %
  assert.equal(r.bonus.health, 4922);   // 562.50 × 8.75 %
  assert.equal(r.summer.pension, 53010);
  assert.equal(r.bonus.pension, 53010);
});
test('summer bonus as a fixed amount flows into month, year and average', () => {
  const r = T.calculate(SB({ summerMode: 'fixed', summerAmount: 150000 }), 500000);
  assert.equal(r.summer.gross, 150000);
  assert.equal(r.year.gross, 500000 * 13 + 150000);
  assert.equal(r.year.net, r.regular.net * 12 + r.bonus.net + r.summer.net);
  assert.equal(r.summerMonth.net, r.regular.net + r.summer.net);
  assert.equal(r.average.gross, Math.round((500000 * 13 + 150000) / 12));
});
test('summer bonus off adds nothing', () => {
  const r = T.calculate(S(), 500000);
  assert.equal(r.summer.gross, 0);
  assert.equal(r.year.gross, 6500000);
});
test('JAEG note counts the summer bonus', () => {
  const codes = (o) => T.calculate(S({ insurance: 'private', ...o }), 570000).notes.map((n) => n.code);
  assert.deepEqual(codes({}), ['jaeg']);                                              // 74,100 a year
  assert.deepEqual(codes({ summerBonus: true, summerMode: 'percent', summerPercent: 100, summerMonth: 6 }), []); // 79,800
});
test('solver reaches at least the target with a percentage summer bonus', () => {
  const s = SB();
  const g = T.solve(s, 'yearNet', 5000000);
  const at = (x) => T.calculate(s, x).year.net;
  assert.ok(at(g) >= 5000000 && at(g - 1) < 5000000);
});
test('restore validates summer bonus fields', () => {
  const good = { summerBonus: true, summerMode: 'fixed', summerPercent: 75, summerAmount: 200000, summerMonth: 7 };
  assert.deepEqual(T.restore({ settings: good }).settings, { ...T.DEFAULTS, ...good });
  const bad = T.restore({ settings: { summerBonus: 'yes', summerMode: 'x', summerPercent: -1, summerAmount: 1e12, summerMonth: 11 } });
  assert.deepEqual(bad.settings, T.DEFAULTS);
});

test('age 64 and older gets a note', () => {
  const codes = (age) => T.calculate(S({ age }), 500000).notes.map((n) => n.code);
  assert.deepEqual(codes(63), []);
  assert.deepEqual(codes(64), ['age64']);
});
test('JAEG and midijob checks count a taxable benefit card', () => {
  const codes = (o, g) => T.calculate(S({ thirteenth: false, ...o }), g).notes.map((n) => n.code);
  assert.deepEqual(codes({ insurance: 'private' }, 640000), ['jaeg']);                              // 76,800
  assert.deepEqual(codes({ insurance: 'private', benefitCard: 6000 }, 640000), ['benefitTaxable']); // 77,520
  assert.deepEqual(codes({}, 198000), ['midijob']);
  assert.deepEqual(codes({ benefitCard: 6000 }, 198000), ['benefitTaxable']);                       // 2,040
});
test('solver crosses the Soli cliff of a large fixed summer bonus', () => {
  const s = SB({ summerMode: 'fixed', summerAmount: 5000000 });
  const at = (x) => T.calculate(s, x).year.net;
  const target = at(353200);
  const g = T.solve(s, 'yearNet', target);
  assert.ok(g <= 353200, `got ${g}`);
  assert.ok(at(g) >= target && at(g - 1) < target);
});
test('state round-trips through a URL query', () => {
  const state = { settings: S({ taxClass: 3, state: 'BY', church: true, summerBonus: true, summerAmount: 200000 }),
    anchor: { field: 'yearNet', cents: 5000000 }, lang: 'de' };
  const q = T.encodeState(state);
  assert.ok(!q.includes('age='), 'defaults are left out');
  assert.deepEqual(T.restore(T.decodeState(q)), state);
  assert.deepEqual(T.restore(T.decodeState('')), { settings: T.DEFAULTS, anchor: null, lang: null });
  assert.deepEqual(T.restore(T.decodeState('f=monthlyNet&c=abc&taxClass=9')), { settings: T.DEFAULTS, anchor: null, lang: null });
});
