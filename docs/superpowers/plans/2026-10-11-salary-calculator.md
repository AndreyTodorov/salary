# Salary Finder 2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, GitHub-Pages-hosted German salary calculator (tax year 2026) with a 13th salary, where any gross/net figure can be typed and all others recompute.

**Architecture:** `tax.js` is a dependency-free classic script holding a cent-exact port of the BMF PAP 2026 plus social security and a reverse solver; it exports `SalaryTax` to `window` or `module.exports`. `index.html` holds the UI (inline CSS + script) and only calls `SalaryTax.calculate`, `SalaryTax.solve` and `SalaryTax.parseAmount`. Tests run in Node against `tax.js`.

**Tech Stack:** Plain HTML/CSS/JS (ES2020), Node ≥ 18 built-in `node:test`, Google Font Archivo.

**Spec:** `docs/specs/2026-10-11-salary-calculator-design.md`

## Global Constraints

- No build step, no npm dependencies; `index.html` must work from `file://` and from GitHub Pages (relative paths only, classic `<script src="tax.js">`).
- All money values in `tax.js` are integer cents. Rates are integers in 1/100000 (`RATE = 100000`).
- Integer division helper `div(a, b) = Math.floor(a / b)` is exact for `0 ≤ a < 4.5e15`; never feed it larger values. Tariff polynomials use `BigInt`.
- Tax year 2026 constants exactly as in the spec (GFB 12,348; SOLZFREI 20,350; W1/W2/W3 14,071/34,939/222,260; BBG RV/ALV 101,400 €/yr, 8,450 €/month; BBG KV/PV 69,750 €/yr, 5,812.50 €/month).
- Vorsorgepauschale uses KV rate 7.0 % + Zusatzbeitrag/2 (PAP `KVSATZAN`); actual employee KV contribution uses 7.3 % + Zusatzbeitrag/2. Do not mix them.
- 13th salary = one regular monthly gross, paid in November.
- UI copy in English, sentence case, no all-caps labels. Numbers shown in German format (`5.000,00 €`).
- Palette/type from the spec: paper `#F2F4F1`, ink `#1C2A28`, net `#0E7A5C`, tax `#7D4A73`, social `#4C6A8C`, bonus `#E0A12B`; Archivo variable (wdth 62–125).
- Kinderfreibetrag-Zähler derived from children: 0.5 per child in classes I and II, 1.0 per child in III and IV, 0 in V and VI.

## Review Focus

- Typed amounts in German or English format (`5.000,50`, `5000.50`, `5.000`, `5 000 €`) must parse to the same cents; garbage or empty input must not change the numbers — pinned in Task 4 (`parseAmount` tests).
- Salaries above the contribution caps with a 13th month (e.g. 8,000/month): bonus pays no KV/PV and only partial RV/ALV — pinned in Task 3.
- Gross 0 and tiny salaries must yield finite numbers (no NaN, no negative tax) — pinned in Task 3.
- An unreachable target (net larger than achievable at 1,000,000 €/month) must clamp, not hang — pinned in Task 4.
- Saxony care-insurance split and children-based PV discounts — pinned in Task 3.

---

## File structure

```
index.html      UI: markup, inline CSS, inline UI script
tax.js          PAP 2026 port, social security, calculate(), solve(), parseAmount()
tax.test.js     node --test suite
```

---

### Task 1: PAP 2026 for regular monthly wages

**Files:**
- Create: `tax.js`
- Test: `tax.test.js`

**Interfaces:**
- Produces: `SalaryTax.pap(input) → { LSTLZZ, SOLZLZZ, BK, STS, SOLZS, BKS }` (all cents). `input` uses BMF names: `{ STKL, RE4, ZKF=0, KVZ=0, PVZ=0, PVS=0, PVA=0, PKV=0, PKPV=0, PKPVAGZ=0, R=0, JRE4=0, SONSTB=0 }`, money in cents, `KVZ` in percent (e.g. `2.9`). Task 1 returns `STS/SOLZS/BKS = 0`.

- [ ] **Step 1: Write the failing tests**

`tax.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL with `Cannot find module './tax.js'`

- [ ] **Step 3: Implement `tax.js`**

```js
/* German salary calculator, tax year 2026.
   Lohnsteuer is a port of the BMF Programmablaufplan 2026 (Lohnsteuer2026.xml, Stand 2025-10-23),
   limited to employees without Versorgungsbezüge, Altersentlastungsbetrag, Freibeträge or
   Entschädigungen, factor f = 1, ALV = 0, KRV = 0.
   Money is integer cents. Rates are integers in 1/100000. */
(function (root) {
  'use strict';

  const RATE = 100000;
  const GFB = 12348;
  const SOLZFREI = 20350;
  const W1STKL5 = 14071, W2STKL5 = 34939, W3STKL5 = 222260;
  const BBGRVALV = 10140000; // cents per year
  const BBGKVPV = 6975000;
  const RVSATZAN = 9300, AVSATZAN = 1300;

  // Exact for 0 <= a < 4.5e15 and positive integer b.
  const div = (a, b) => Math.floor(a / b);
  const ceilEuro = (cents) => Math.ceil(cents / 100) * 100;

  // §32a EStG 2026 (UPTAB26), x in whole euros, returns euros.
  function tariff(x) {
    if (x < GFB + 1) return 0;
    if (x < 17800) {
      const y = BigInt(x - GFB) * 100n; // Y in millionths
      return Number(((91451n * y + 140000000000n) * y) / 100000000000000n);
    }
    if (x < 69879) {
      const z = BigInt(x - 17799) * 100n;
      return Number(((1731n * z + 23970000000n) * z + 10348700000000000n) / 10000000000000n);
    }
    if (x < 277826) return div(42 * x - 1113563, 100);
    return div(45 * x - 1947038, 100);
  }

  function up56(zx) {
    const diff = (tariff(div(zx * 5, 4)) - tariff(div(zx * 3, 4))) * 2;
    const mist = div(zx * 14, 100);
    return mist > diff ? mist : diff;
  }

  // MST5_6, zzx in euros.
  function mst56(zzx) {
    if (zzx > W2STKL5) {
      let st = up56(W2STKL5);
      if (zzx > W3STKL5) {
        st += div((W3STKL5 - W2STKL5) * 42, 100);
        return st + div((zzx - W3STKL5) * 45, 100);
      }
      return st + div((zzx - W2STKL5) * 42, 100);
    }
    const vergl = up56(zzx);
    if (zzx > W1STKL5) {
      const hoch = up56(W1STKL5) + div((zzx - W1STKL5) * 42, 100);
      return hoch < vergl ? hoch : vergl;
    }
    return vergl;
  }

  // UPMLST: annual tax in euros for zvE in cents.
  function incomeTax(zve, p) {
    const x = zve < 100 ? 0 : div(zve, 100 * p.kztab);
    return p.stkl < 5 ? tariff(x) * p.kztab : mst56(x);
  }

  // UPEVP + MVSPKVPV + MVSPHB: Vorsorgepauschale in cents (whole euros).
  function vorsorgepauschale(zre4vp, p) {
    const vspr = div(Math.min(zre4vp, BBGRVALV) * RVSATZAN, RATE);
    let vspkvpv;
    if (p.pkv) vspkvpv = p.stkl === 6 ? 0 : Math.max(0, p.pkpv * 12 - p.pkpvagz * 12);
    else vspkvpv = div(Math.min(zre4vp, BBGKVPV) * (p.kvsatzan + p.pvsatzan), RATE);
    let vsp = ceilEuro(vspr + vspkvpv);
    if (p.stkl !== 6) {
      const vspalv = div(Math.min(zre4vp, BBGRVALV) * AVSATZAN, RATE);
      const vsphb = Math.min(vspalv + vspkvpv, 190000);
      vsp = Math.max(vsp, ceilEuro(vspr + vsphb));
    }
    return vsp;
  }

  // MZTABFB + MLSTJAHR for an annual wage in cents.
  function annualTax(zre4, p) {
    const anp = p.stkl === 6 ? 0 : Math.min(ceilEuro(zre4), 123000);
    const sap = p.stkl === 6 ? 0 : 3600;
    const efa = p.stkl === 2 ? 426000 : 0;
    const zve = zre4 - (efa + anp + sap) - vorsorgepauschale(zre4, p);
    return { zve, st: incomeTax(zve, p) };
  }

  function papParams(i) {
    const stkl = i.STKL;
    const zkf = i.ZKF || 0;
    const kfbPerZ = stkl <= 3 ? 9756 : stkl === 4 ? 4878 : 0;
    let pvsatzan = i.PVS ? 2300 : 1800;
    pvsatzan += i.PVZ ? 600 : -250 * (i.PVA || 0);
    return {
      stkl,
      kztab: stkl === 3 ? 2 : 1,
      zkf,
      kfb: Math.floor(zkf * kfbPerZ) * 100,
      kvsatzan: 7000 + Math.round((i.KVZ || 0) * 100) * 5,
      pvsatzan,
      pkv: !!i.PKV,
      pkpv: i.PKPV || 0,
      pkpvagz: i.PKPVAGZ || 0,
      church: !!i.R,
    };
  }

  function pap(input) {
    const p = papParams(input);
    const solzfrei = SOLZFREI * p.kztab;

    // MBERECH, LZZ = 2 (month)
    const reg = annualTax((input.RE4 || 0) * 12, p);
    const lstjahr = reg.st;
    const jbmg = p.zkf > 0 ? incomeTax(reg.zve - p.kfb, p) : lstjahr;
    let solzlzz = 0;
    if (jbmg > solzfrei) {
      const solzj = Math.min(div(jbmg * 11, 2), div((jbmg - solzfrei) * 119, 10));
      solzlzz = div(solzj, 12);
    }

    return {
      LSTLZZ: div(lstjahr * 100, 12),
      SOLZLZZ: solzlzz,
      BK: p.church ? div(jbmg * 100, 12) : 0,
      STS: 0, SOLZS: 0, BKS: 0,
    };
  }

  const api = { pap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SalaryTax = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: all 13 tests PASS. If a BMF value is off, compare step by step with `Lohnsteuer2026.xml` (methods MPARA, MZTABFB, UPEVP, MVSPKVPV, MVSPHB, UPMLST, MST5_6, UPTAB26, MSOLZ); do not adjust expected values.

- [ ] **Step 5: Commit**

```bash
git add tax.js tax.test.js
git commit -m "Port BMF PAP 2026 for monthly Lohnsteuer and Soli"
```

---

### Task 2: Sonstiger Bezug (13th salary) in the PAP

**Files:**
- Modify: `tax.js` (function `pap`)
- Test: `tax.test.js`

**Interfaces:**
- Consumes: `annualTax`, `incomeTax`, `papParams` from Task 1.
- Produces: `pap()` now fills `STS`, `SOLZS`, `BKS` (cents) when `SONSTB > 0`, using `JRE4` as the annual regular wage.

- [ ] **Step 1: Write the failing tests** (append to `tax.test.js`)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: the three bonus tests FAIL (`0 !== 66400` etc.).

- [ ] **Step 3: Implement MSONST in `pap`**

Replace the `return { ... }` block at the end of `pap` with:

```js
    // MSONST / MOSONST / MRE4SONST / STSMIN / MSOLZSTS
    let sts = 0, solzs = 0;
    const sonstb = input.SONSTB || 0;
    if (sonstb > 0) {
      const jre4 = input.JRE4 || 0;
      const without = annualTax(jre4, p);
      const withB = annualTax(jre4 + sonstb, p);
      sts = Math.max(0, (withB.st - without.st) * 100);
      if (sts > 0) {
        const solzszve = p.zkf > 0 ? withB.zve - p.kfb : withB.zve;
        if (incomeTax(solzszve, p) > solzfrei) solzs = div(sts * 55, 1000);
      }
    }

    return {
      LSTLZZ: div(lstjahr * 100, 12),
      SOLZLZZ: solzlzz,
      BK: p.church ? div(jbmg * 100, 12) : 0,
      STS: sts,
      SOLZS: solzs,
      BKS: p.church ? sts : 0,
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: all 17 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tax.js tax.test.js
git commit -m "Tax the 13th salary as a sonstiger Bezug (PAP MSONST)"
```

---

### Task 3: Social security and `calculate()`

**Files:**
- Modify: `tax.js`
- Test: `tax.test.js`

**Interfaces:**
- Consumes: `pap` from Tasks 1–2.
- Produces:
  - `SalaryTax.DEFAULTS` — settings object `{ taxClass: 1, state: 'BE', church: false, age: 30, children: 0, insurance: 'public', zusatzbeitrag: 2.9, privatePremium: 60000, thirteenth: true }` (`privatePremium` in cents per month incl. care).
  - `SalaryTax.STATES` — array of `[code, name]`, 16 entries.
  - `SalaryTax.calculate(settings, grossCents)` → `{ regular, bonus, november, average, year, notes }` where `regular`, `bonus`, `year` are `Breakdown = { gross, incomeTax, soli, church, health, care, pension, unemployment, net }` (cents; `bonus` has all zeros when the 13th is off), `november = { gross, net }`, `average = { gross, net }` (year ÷ 12, rounded), `notes` = array of strings.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: new tests FAIL with `T.calculate is not a function` / `T.DEFAULTS` undefined.

- [ ] **Step 3: Implement** — add above `const api = …` in `tax.js`:

```js
  const BBG_KV_MONTH = 581250;
  const BBG_RV_MONTH = 845000;
  const JAEG_MONTH = 645000;
  const MIDIJOB_MAX = 200000;
  const PKV_SUBSIDY_MAX = 50859 + 10463; // KV + PV, 2026
  const BONUS_MONTH = 11; // November

  const STATES = [
    ['BW', 'Baden-Württemberg'], ['BY', 'Bavaria'], ['BE', 'Berlin'], ['BB', 'Brandenburg'],
    ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hesse'], ['MV', 'Mecklenburg-Western Pomerania'],
    ['NI', 'Lower Saxony'], ['NW', 'North Rhine-Westphalia'], ['RP', 'Rhineland-Palatinate'],
    ['SL', 'Saarland'], ['SN', 'Saxony'], ['ST', 'Saxony-Anhalt'], ['SH', 'Schleswig-Holstein'],
    ['TH', 'Thuringia'],
  ];

  const DEFAULTS = {
    taxClass: 1, state: 'BE', church: false, age: 30, children: 0,
    insurance: 'public', zusatzbeitrag: 2.9, privatePremium: 60000, thirteenth: true,
  };

  const roundRate = (cents, rate) => div(cents * rate + RATE / 2, RATE);

  function careRate(s) {
    const childless = s.children === 0 && s.age >= 23;
    const discount = Math.max(0, Math.min(s.children, 5) - 1) * 250;
    return (s.state === 'SN' ? 2300 : 1800) + (childless ? 600 : -discount);
  }

  function pkvSubsidy(s) {
    return Math.min(div(s.privatePremium, 2), PKV_SUBSIDY_MAX);
  }

  function papInput(s, gross) {
    const childless = s.children === 0 && s.age >= 23;
    const pkv = s.insurance === 'private';
    const perChild = s.taxClass <= 2 ? 0.5 : s.taxClass <= 4 ? 1 : 0;
    return {
      STKL: s.taxClass,
      RE4: gross,
      ZKF: s.children * perChild,
      KVZ: s.zusatzbeitrag,
      PVZ: childless ? 1 : 0,
      PVS: s.state === 'SN' ? 1 : 0,
      PVA: childless ? 0 : Math.max(0, Math.min(s.children, 5) - 1),
      PKV: pkv ? 1 : 0,
      PKPV: pkv ? s.privatePremium : 0,
      PKPVAGZ: pkv ? pkvSubsidy(s) : 0,
      R: s.church ? 1 : 0,
      JRE4: gross * 12,
      SONSTB: s.thirteenth ? gross : 0,
    };
  }

  // Employee contributions on a contributory base; kvBase/rvBase already capped.
  function contributions(s, kvBase, rvBase, privateShare) {
    const pkv = s.insurance === 'private';
    const kvRate = 7300 + Math.round(s.zusatzbeitrag * 100) * 5;
    return {
      health: pkv ? privateShare : roundRate(kvBase, kvRate),
      care: pkv ? 0 : roundRate(kvBase, careRate(s)),
      pension: roundRate(rvBase, RVSATZAN),
      unemployment: roundRate(rvBase, AVSATZAN),
    };
  }

  function breakdown(gross, incomeTax, soli, church, sv) {
    const net = gross - incomeTax - soli - church - sv.health - sv.care - sv.pension - sv.unemployment;
    return { gross, incomeTax, soli, church, ...sv, net };
  }

  // §23a SGB IV: one-off payment fills the room under the pro-rata annual cap up to its month.
  function bonusBase(gross, bonus, monthCap) {
    const room = BONUS_MONTH * monthCap - BONUS_MONTH * Math.min(gross, monthCap);
    return Math.min(bonus, Math.max(0, room));
  }

  function calculate(s, gross) {
    const r = pap(papInput(s, gross));
    const churchRate = s.state === 'BW' || s.state === 'BY' ? 8 : 9;
    const privateShare = s.insurance === 'private' ? s.privatePremium - pkvSubsidy(s) : 0;

    const regular = breakdown(gross, r.LSTLZZ, r.SOLZLZZ, div(r.BK * churchRate, 100),
      contributions(s, Math.min(gross, BBG_KV_MONTH), Math.min(gross, BBG_RV_MONTH), privateShare));

    const b = s.thirteenth ? gross : 0;
    const bonus = breakdown(b, r.STS, r.SOLZS, div(r.BKS * churchRate, 100),
      contributions(s, bonusBase(gross, b, BBG_KV_MONTH), bonusBase(gross, b, BBG_RV_MONTH), 0));

    const year = {};
    for (const k of Object.keys(regular)) year[k] = regular[k] * 12 + bonus[k];

    const notes = [];
    if (gross > 0 && gross <= MIDIJOB_MAX) {
      notes.push('Below 2,000 € a month special mini- and midijob rules apply, so these results are only approximate.');
    }
    if (s.insurance === 'private' && gross < JAEG_MONTH) {
      notes.push('Private health insurance is normally only possible above 6,450 € a month (77,400 € a year).');
    }

    return {
      regular,
      bonus,
      november: { gross: regular.gross + bonus.gross, net: regular.net + bonus.net },
      average: { gross: Math.round(year.gross / 12), net: Math.round(year.net / 12) },
      year,
      notes,
    };
  }
```

Change the export line to:

```js
  const api = { pap, calculate, DEFAULTS, STATES };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: all 27 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tax.js tax.test.js
git commit -m "Add social security and the calculate() breakdown"
```

---

### Task 4: Reverse solver and amount parsing

**Files:**
- Modify: `tax.js`
- Test: `tax.test.js`

**Interfaces:**
- Consumes: `calculate` from Task 3.
- Produces:
  - `SalaryTax.FIELDS` — `['monthlyGross', 'monthlyNet', 'averageGross', 'averageNet', 'yearGross', 'yearNet']`.
  - `SalaryTax.read(result, field)` → cents for that field.
  - `SalaryTax.solve(settings, field, targetCents)` → monthly gross in cents whose `read(...)` is closest to the target (clamped to `0 … MAX_GROSS`).
  - `SalaryTax.MAX_GROSS = 100000000` (1,000,000 € per month).
  - `SalaryTax.parseAmount(text)` → cents or `null`.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: new tests FAIL with `T.solve is not a function`.

- [ ] **Step 3: Implement** — add above `const api = …`:

```js
  const MAX_GROSS = 100000000;

  const READERS = {
    monthlyGross: (r) => r.regular.gross,
    monthlyNet: (r) => r.regular.net,
    averageGross: (r) => r.average.gross,
    averageNet: (r) => r.average.net,
    yearGross: (r) => r.year.gross,
    yearNet: (r) => r.year.net,
  };
  const FIELDS = Object.keys(READERS);
  const read = (result, field) => READERS[field](result);

  // Every field rises with gross, but net dips by a few cents where the annual tax steps
  // up a euro. Bisect to the crossing, then pick the closest value within ±2 € of gross.
  function solve(s, field, target) {
    const f = (g) => read(calculate(s, g), field);
    if (target <= 0) return 0;
    if (f(MAX_GROSS) < target) return MAX_GROSS;
    let lo = 0, hi = MAX_GROSS;
    while (lo < hi) {
      const mid = div(lo + hi, 2);
      if (f(mid) < target) lo = mid + 1; else hi = mid;
    }
    let best = lo, bestDiff = Math.abs(f(lo) - target);
    for (let g = Math.max(0, lo - 200); g <= Math.min(MAX_GROSS, lo + 200); g++) {
      const d = Math.abs(f(g) - target);
      if (d < bestDiff) { best = g; bestDiff = d; }
    }
    return best;
  }

  // "5.000,50", "5000.50", "5,000.50", "5 000 €" → cents; null if not a non-negative amount.
  function parseAmount(text) {
    let t = String(text).replace(/[\s€ ]/g, '');
    if (!/^\d[\d.,]*$/.test(t)) return null;
    const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
    if (lastComma > lastDot) {
      t = t.replace(/\./g, '').replace(',', '.');           // German decimal comma
    } else if (lastDot > lastComma && lastComma >= 0) {
      t = t.replace(/,/g, '');                             // English thousands comma
    } else if (lastDot >= 0 && (/\.\d{3}$/.test(t) || t.indexOf('.') !== lastDot)) {
      t = t.replace(/\./g, '');                            // German thousands dots
    }
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
  }
```

Change the export line to:

```js
  const api = { pap, calculate, solve, read, parseAmount, DEFAULTS, STATES, FIELDS, MAX_GROSS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: all 32 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tax.js tax.test.js
git commit -m "Add reverse solver and German/English amount parsing"
```

---

### Task 5: The page

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `SalaryTax.calculate`, `solve`, `read`, `parseAmount`, `DEFAULTS`, `STATES`, `FIELDS`.

Behaviour:
- `anchor = { field, cents }` is the last value the person typed (default `{ field: 'monthlyGross', cents: 500000 }`). Gross = `solve(settings, anchor.field, anchor.cents)` (or the cents directly for `monthlyGross`). Changing a setting re-solves, so the typed number stays put. The anchored cell gets a "pinned" style.
- Typing in a cell: parse on each `input`; invalid → `aria-invalid="true"` and nothing else changes; valid → set anchor, recompute, update every other cell. The active cell is reformatted on `blur`.
- Values that changed flash briefly (disabled under `prefers-reduced-motion`).
- With the 13th off, the November and average rows and the bonus column are hidden.
- Settings and anchor persist in `localStorage` (wrapped in try/catch).

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salary Finder 2026</title>
<meta name="description" content="German take-home pay for 2026 with a 13th salary. Type any gross or net figure and see every other one.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..800&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #F2F4F1; --surface: #FBFCFA; --ink: #1C2A28; --muted: #5A6865; --line: #D3DBD6;
    --net: #0E7A5C; --tax: #7D4A73; --social: #4C6A8C; --bonus: #E0A12B; --bonus-ink: #8A5A00;
    --flash: rgba(14, 122, 92, .14);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #111917; --surface: #18221F; --ink: #E3EAE6; --muted: #93A29D; --line: #2B3834;
      --net: #43C497; --tax: #C990BD; --social: #8FAAD0; --bonus: #F0B94A; --bonus-ink: #F0B94A;
      --flash: rgba(67, 196, 151, .18);
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: "Archivo", system-ui, sans-serif; font-size: 1rem; line-height: 1.5;
    font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 72rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
  h1 {
    margin: 0 0 .5rem; max-width: 16ch;
    font-size: clamp(2.25rem, 7vw, 3.75rem); line-height: 1; font-weight: 780; font-stretch: 68%;
  }
  .lede { margin: 0; max-width: 46ch; color: var(--muted); }
  h2 { font-size: 1.125rem; font-weight: 650; margin: 0 0 .75rem; }

  .layout {
    display: grid; gap: 2.5rem; margin-top: 2.5rem;
    grid-template-areas: "figures" "strip" "settings" "breakdown";
  }
  @media (min-width: 900px) {
    .layout {
      grid-template-columns: 18.5rem minmax(0, 1fr); column-gap: 3.5rem;
      grid-template-areas: "settings figures" "settings strip" "settings breakdown";
    }
    .settings { position: sticky; top: 1.5rem; align-self: start; }
  }

  /* Figures: the editable grid */
  .figures { grid-area: figures; }
  .figures table { width: 100%; border-collapse: collapse; }
  .figures th { font-weight: 500; color: var(--muted); text-align: right; padding: 0 0 .25rem; font-size: .9375rem; }
  .figures th[scope="row"] { text-align: left; padding: .9rem .75rem .9rem 0; color: var(--ink); width: 34%; }
  .figures th[scope="row"] small { display: block; color: var(--muted); font-size: .8125rem; font-weight: 400; }
  .figures td { padding: .35rem 0 .35rem .75rem; border-top: 1px solid var(--line); }
  .figures tr:first-child td, .figures tr:first-child th { border-top: 0; }
  .figures tbody th[scope="row"] { border-top: 1px solid var(--line); }
  .figures tbody tr:first-child th[scope="row"] { border-top: 0; }
  .cell {
    display: block; width: 100%; min-width: 0; padding: .2rem .1rem; margin: 0;
    font: inherit; font-size: clamp(1.35rem, 5.2vw, 2.25rem); font-weight: 640; font-stretch: 70%;
    text-align: right; color: var(--ink); background: transparent;
    border: 0; border-bottom: 2px solid transparent; border-radius: 0;
    transition: background-color .6s ease;
  }
  input.cell { border-bottom-color: var(--line); cursor: text; }
  input.cell:hover { border-bottom-color: var(--muted); }
  input.cell:focus { outline: none; border-bottom-color: var(--net); background: var(--surface); }
  input.cell[aria-invalid="true"] { border-bottom-color: var(--tax); }
  .cell.net { color: var(--net); }
  .cell.pinned { border-bottom-style: double; border-bottom-width: 4px; border-bottom-color: var(--net); }
  .cell.flash { background-color: var(--flash); transition: none; }
  .row-bonus .cell { color: var(--bonus-ink); }
  .row-bonus th[scope="row"] { color: var(--bonus-ink); }
  .hint { margin: .75rem 0 0; color: var(--muted); font-size: .875rem; }

  /* The year strip */
  .strip { grid-area: strip; margin: 0; }
  .bars {
    display: grid; grid-template-columns: repeat(12, 1fr); gap: clamp(3px, 1vw, 8px);
    align-items: end; height: clamp(8rem, 26vw, 12rem);
  }
  .bar { display: flex; flex-direction: column-reverse; height: 100%; justify-content: flex-start; }
  .bar span { display: block; transition: height .35s cubic-bezier(.2, .7, .2, 1); }
  .bar .reg { background: var(--net); border-radius: 0 0 2px 2px; }
  .bar .bon { background: var(--bonus); border-radius: 3px 3px 0 0; }
  .months { display: grid; grid-template-columns: repeat(12, 1fr); gap: clamp(3px, 1vw, 8px); margin-top: .4rem; }
  .months span { text-align: center; font-size: .75rem; color: var(--muted); }
  .months .nov { color: var(--bonus-ink); font-weight: 650; }
  .strip figcaption { margin-top: .75rem; color: var(--muted); font-size: .9375rem; max-width: 60ch; }
  .strip figcaption strong { color: var(--ink); font-weight: 650; }

  /* Settings */
  .settings { grid-area: settings; }
  .field { margin: 0 0 1.25rem; border: 0; padding: 0; }
  .field > label, .field > legend { display: block; font-weight: 600; font-size: .9375rem; margin-bottom: .4rem; padding: 0; }
  .field .sub { color: var(--muted); font-size: .8125rem; margin: .35rem 0 0; }
  select, input.text {
    width: 100%; padding: .55rem .65rem; font: inherit; color: var(--ink);
    background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  }
  input.text { font-variant-numeric: tabular-nums; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
  .segmented { display: flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--surface); }
  .segmented label { flex: 1; position: relative; text-align: center; cursor: pointer; }
  .segmented label + label { border-left: 1px solid var(--line); }
  .segmented input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .segmented span { display: block; padding: .5rem .25rem; font-weight: 600; font-size: .9375rem; }
  .segmented input:checked + span { background: var(--ink); color: var(--paper); }
  .segmented input:focus-visible + span { outline: 2px solid var(--net); outline-offset: -4px; }
  .switch { display: flex; align-items: center; justify-content: space-between; gap: 1rem; cursor: pointer; font-weight: 600; font-size: .9375rem; }
  .switch input { appearance: none; width: 2.75rem; height: 1.6rem; border-radius: 1rem; background: var(--line); position: relative; cursor: pointer; flex: none; margin: 0; transition: background .2s; }
  .switch input::after { content: ""; position: absolute; top: .2rem; left: .2rem; width: 1.2rem; height: 1.2rem; border-radius: 50%; background: var(--surface); transition: transform .2s; }
  .switch input:checked { background: var(--net); }
  .switch input:checked::after { transform: translateX(1.15rem); }
  .switch.bonus input:checked { background: var(--bonus); }
  :focus-visible { outline: 2px solid var(--net); outline-offset: 2px; }
  [hidden] { display: none !important; }

  /* Breakdown */
  .breakdown { grid-area: breakdown; }
  .breakdown table { width: 100%; border-collapse: collapse; font-size: .9375rem; }
  .breakdown th, .breakdown td { padding: .5rem 0 .5rem .75rem; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .breakdown th:first-child { text-align: left; padding-left: 0; white-space: normal; }
  .breakdown thead th { font-weight: 500; color: var(--muted); }
  .breakdown thead th.bonus-col { color: var(--bonus-ink); }
  .breakdown tbody th { font-weight: 450; }
  .breakdown tbody th::before { content: ""; display: inline-block; width: .6rem; height: .6rem; border-radius: 2px; margin-right: .5rem; vertical-align: .05em; }
  .breakdown .tax th::before { background: var(--tax); }
  .breakdown .social th::before { background: var(--social); }
  .breakdown .gross th::before { background: transparent; border: 1px solid var(--muted); }
  .breakdown .net th, .breakdown .net td { font-weight: 700; color: var(--net); border-bottom: 0; }
  .breakdown .net th::before { background: var(--net); }
  .notes { margin: 1rem 0 0; padding: 0; list-style: none; color: var(--muted); font-size: .875rem; }
  .notes li { padding-left: 1rem; border-left: 3px solid var(--bonus); margin-bottom: .5rem; }
  footer { margin-top: 4rem; color: var(--muted); font-size: .8125rem; max-width: 70ch; }

  @media (max-width: 420px) {
    .breakdown table { font-size: .8125rem; }
    .breakdown th, .breakdown td { padding-left: .4rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>What should my salary be?</h1>
    <p class="lede">German take-home pay for 2026, with a 13th salary. Type into any number and the rest follow.</p>
  </header>

  <main class="layout">
    <section class="figures" aria-labelledby="figures-title">
      <h2 id="figures-title" hidden>Your salary</h2>
      <table>
        <thead><tr><td></td><th scope="col">Gross</th><th scope="col">Net</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">Every month</th>
            <td><input class="cell" data-field="monthlyGross" inputmode="decimal" autocomplete="off" aria-label="Every month, gross"></td>
            <td><input class="cell net" data-field="monthlyNet" inputmode="decimal" autocomplete="off" aria-label="Every month, net"></td>
          </tr>
          <tr class="row-bonus" data-bonus>
            <th scope="row">November<small>with 13th salary</small></th>
            <td><output class="cell" id="novGross"></output></td>
            <td><output class="cell" id="novNet"></output></td>
          </tr>
          <tr data-bonus>
            <th scope="row">Average month<small>year ÷ 12</small></th>
            <td><input class="cell" data-field="averageGross" inputmode="decimal" autocomplete="off" aria-label="Average month, gross"></td>
            <td><input class="cell net" data-field="averageNet" inputmode="decimal" autocomplete="off" aria-label="Average month, net"></td>
          </tr>
          <tr>
            <th scope="row">Year</th>
            <td><input class="cell" data-field="yearGross" inputmode="decimal" autocomplete="off" aria-label="Year, gross"></td>
            <td><input class="cell net" data-field="yearNet" inputmode="decimal" autocomplete="off" aria-label="Year, net"></td>
          </tr>
        </tbody>
      </table>
      <p class="hint" id="pinHint"></p>
    </section>

    <figure class="strip">
      <div class="bars" id="bars" role="img"></div>
      <div class="months" aria-hidden="true">
        <span>J</span><span>F</span><span>M</span><span>A</span><span>M</span><span>J</span>
        <span>J</span><span>A</span><span>S</span><span>O</span><span class="nov">N</span><span>D</span>
      </div>
      <figcaption id="stripCaption"></figcaption>
    </figure>

    <form class="settings" id="settings" aria-labelledby="settings-title" onsubmit="return false">
      <h2 id="settings-title">About you</h2>

      <label class="switch bonus field">13th salary in November <input type="checkbox" name="thirteenth"></label>

      <fieldset class="field">
        <legend>Tax class</legend>
        <div class="segmented" id="taxClass"></div>
        <p class="sub" id="taxClassHint"></p>
      </fieldset>

      <div class="field">
        <label for="state">Where you work</label>
        <select id="state" name="state"></select>
      </div>

      <div class="pair">
        <div class="field">
          <label for="age">Age</label>
          <input class="text" id="age" name="age" type="number" min="15" max="99" inputmode="numeric">
        </div>
        <div class="field">
          <label for="children">Children</label>
          <select id="children" name="children">
            <option value="0">None</option><option value="1">1</option><option value="2">2</option>
            <option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6+</option>
          </select>
        </div>
      </div>

      <label class="switch field">Church tax <input type="checkbox" name="church"></label>

      <fieldset class="field">
        <legend>Health insurance</legend>
        <div class="segmented">
          <label><input type="radio" name="insurance" value="public"><span>Public</span></label>
          <label><input type="radio" name="insurance" value="private"><span>Private</span></label>
        </div>
      </fieldset>

      <div class="field" id="publicFields">
        <label for="zusatzbeitrag">Insurer's extra contribution (Zusatzbeitrag)</label>
        <input class="text" id="zusatzbeitrag" name="zusatzbeitrag" inputmode="decimal">
        <p class="sub">In percent. 2.9 is the 2026 average.</p>
      </div>
      <div class="field" id="privateFields" hidden>
        <label for="privatePremium">Monthly premium incl. care insurance</label>
        <input class="text" id="privatePremium" name="privatePremium" inputmode="decimal">
        <p class="sub" id="subsidyHint"></p>
      </div>
    </form>

    <section class="breakdown" aria-labelledby="breakdown-title">
      <h2 id="breakdown-title">Where the money goes</h2>
      <table>
        <thead><tr><th scope="col"></th><th scope="col">Each month</th><th scope="col" class="bonus-col" data-bonus>13th salary</th><th scope="col">Year</th></tr></thead>
        <tbody id="breakdownBody"></tbody>
      </table>
      <ul class="notes" id="notes"></ul>
    </section>
  </main>

  <footer>
    Payroll tax as withheld by your employer under the official 2026 algorithm (BMF Programmablaufplan), with the 2026 social security rates and caps. Your actual yearly tax can differ after a tax return. Mini- and midijobs, self-employment and the class IV factor method are not covered.
  </footer>
</div>

<script src="tax.js"></script>
<script>
(function () {
  'use strict';
  const T = window.SalaryTax;
  const STORE = 'salary-finder-v1';
  const CLASS_HINTS = {
    1: 'Single, or married with a spouse abroad.',
    2: 'Single parent living with your child.',
    3: 'Married, earning clearly more than your spouse (they take class 5).',
    4: 'Married, both earning about the same.',
    5: 'Married, earning clearly less than your spouse (they take class 3).',
    6: 'A second job.',
  };
  const ROWS = [
    ['gross', 'Gross', 'gross'],
    ['incomeTax', 'Income tax', 'tax'],
    ['soli', 'Solidarity surcharge', 'tax'],
    ['church', 'Church tax', 'tax'],
    ['health', 'Health insurance', 'social'],
    ['care', 'Long-term care', 'social'],
    ['pension', 'Pension', 'social'],
    ['unemployment', 'Unemployment insurance', 'social'],
    ['net', 'Net', 'net'],
  ];

  const money = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euros = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const fmt = (c) => money.format(c / 100);
  const fmtEur = (c) => euros.format(Math.round(c / 100)) + ' €';

  let settings = { ...T.DEFAULTS };
  let anchor = { field: 'monthlyGross', cents: 500000 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && saved.settings) settings = { ...settings, ...saved.settings };
    if (saved && saved.anchor && T.FIELDS.includes(saved.anchor.field)) anchor = saved.anchor;
  } catch (e) { /* storage unavailable */ }

  const form = document.getElementById('settings');
  const cells = [...document.querySelectorAll('input.cell')];

  // Build dynamic settings controls
  document.getElementById('taxClass').innerHTML = [1, 2, 3, 4, 5, 6].map((n) =>
    `<label><input type="radio" name="taxClass" value="${n}" aria-label="Tax class ${n}"><span>${n}</span></label>`).join('');
  document.getElementById('state').innerHTML = T.STATES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  document.getElementById('breakdownBody').innerHTML = ROWS.map(([k, label, kind]) =>
    `<tr class="${kind}" data-row="${k}"><th scope="row">${label}</th><td data-col="regular"></td><td data-col="bonus" data-bonus></td><td data-col="year"></td></tr>`).join('');
  document.getElementById('bars').innerHTML = Array.from({ length: 12 }, (_, i) =>
    `<div class="bar"><span class="reg"></span>${i === 10 ? '<span class="bon"></span>' : ''}</div>`).join('');

  function writeForm() {
    form.thirteenth.checked = settings.thirteenth;
    form.church.checked = settings.church;
    form.querySelector(`[name=taxClass][value="${settings.taxClass}"]`).checked = true;
    form.querySelector(`[name=insurance][value="${settings.insurance}"]`).checked = true;
    form.state.value = settings.state;
    form.age.value = settings.age;
    form.children.value = String(settings.children);
    form.zusatzbeitrag.value = String(settings.zusatzbeitrag).replace('.', ',');
    form.privatePremium.value = fmt(settings.privatePremium);
  }

  function readForm() {
    const num = (v, fallback) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : fallback; };
    settings = {
      thirteenth: form.thirteenth.checked,
      church: form.church.checked,
      taxClass: Number(form.querySelector('[name=taxClass]:checked').value),
      insurance: form.querySelector('[name=insurance]:checked').value,
      state: form.state.value,
      age: Math.max(15, Math.round(num(form.age.value, settings.age))),
      children: Number(form.children.value),
      zusatzbeitrag: Math.min(10, Math.max(0, num(form.zusatzbeitrag.value, settings.zusatzbeitrag))),
      privatePremium: T.parseAmount(form.privatePremium.value) ?? settings.privatePremium,
    };
  }

  function grossFromAnchor() {
    return anchor.field === 'monthlyGross' ? Math.min(anchor.cents, T.MAX_GROSS) : T.solve(settings, anchor.field, anchor.cents);
  }

  function setText(el, text) {
    const prop = el.tagName === 'INPUT' ? 'value' : 'textContent';
    if (el[prop] === text) return;
    el[prop] = text;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 60);
  }

  function render(activeEl) {
    const r = T.calculate(settings, grossFromAnchor());
    const on = settings.thirteenth;

    for (const el of cells) {
      el.classList.toggle('pinned', el.dataset.field === anchor.field);
      if (el !== activeEl) setText(el, fmt(T.read(r, el.dataset.field)));
    }
    setText(document.getElementById('novGross'), fmt(r.november.gross));
    setText(document.getElementById('novNet'), fmt(r.november.net));
    document.querySelectorAll('[data-bonus]').forEach((el) => { el.hidden = !on; });

    const label = document.querySelector(`[data-field="${anchor.field}"]`).getAttribute('aria-label');
    document.getElementById('pinHint').textContent = `Kept fixed when you change settings: ${label.toLowerCase()}.`;

    // Year strip
    const max = Math.max(r.november.net, r.regular.net, 1);
    document.querySelectorAll('#bars .bar').forEach((bar, i) => {
      bar.querySelector('.reg').style.height = (r.regular.net / max * 100) + '%';
      const bon = bar.querySelector('.bon');
      if (bon) bon.style.height = (on ? r.bonus.net / max * 100 : 0) + '%';
    });
    document.getElementById('bars').setAttribute('aria-label',
      `Net pay per month: ${fmtEur(r.regular.net)}` + (on ? `, November ${fmtEur(r.november.net)}` : ''));
    document.getElementById('stripCaption').innerHTML = on
      ? `You take home <strong>${fmtEur(r.regular.net)}</strong> most months and <strong>${fmtEur(r.november.net)}</strong> in November. The 13th salary keeps <strong>${Math.round(r.bonus.net / Math.max(r.bonus.gross, 1) * 100)}%</strong> of its gross, compared with ${Math.round(r.regular.net / Math.max(r.regular.gross, 1) * 100)}% for a normal month.`
      : `You take home <strong>${fmtEur(r.regular.net)}</strong> every month.`;

    // Breakdown
    for (const [k] of ROWS) {
      const row = document.querySelector(`[data-row="${k}"]`);
      row.hidden = k === 'church' && !settings.church;
      const sign = ['gross', 'net'].includes(k) ? '' : '−';
      for (const col of ['regular', 'bonus', 'year']) {
        const v = r[col][k];
        row.querySelector(`[data-col="${col}"]`).textContent = (v && sign) + fmt(v);
      }
    }
    document.querySelector('[data-row="health"] th').textContent =
      settings.insurance === 'private' ? 'Private health and care' : 'Health insurance';
    document.querySelector('[data-row="care"]').hidden = settings.insurance === 'private';
    document.getElementById('notes').innerHTML = r.notes.map((n) => `<li>${n}</li>`).join('');

    // Settings hints
    document.getElementById('taxClassHint').textContent = CLASS_HINTS[settings.taxClass];
    document.getElementById('publicFields').hidden = settings.insurance !== 'public';
    document.getElementById('privateFields').hidden = settings.insurance !== 'private';
    const subsidy = Math.min(Math.floor(settings.privatePremium / 2), 61322);
    document.getElementById('subsidyHint').textContent = `Your employer pays ${fmt(subsidy)} € of it (half, up to 613,22 €).`;

    try { localStorage.setItem(STORE, JSON.stringify({ settings, anchor })); } catch (e) { /* ignore */ }
  }

  for (const el of cells) {
    el.addEventListener('input', () => {
      const cents = T.parseAmount(el.value);
      el.setAttribute('aria-invalid', cents === null ? 'true' : 'false');
      if (cents === null) return;
      anchor = { field: el.dataset.field, cents };
      render(el);
    });
    el.addEventListener('focus', () => el.select());
    el.addEventListener('blur', () => { el.removeAttribute('aria-invalid'); render(null); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  }
  form.addEventListener('change', () => { readForm(); writeForm(); render(null); });
  form.addEventListener('input', (e) => { if (e.target.type !== 'text' && !e.target.classList.contains('text')) return; readForm(); render(null); });

  writeForm();
  render(null);
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Check it in a browser**

Open `index.html` with Playwright (`file:///Users/andrey/Projects/salary/index.html`) at 390×844 and 1280×900, light and dark (`emulate_media colorScheme`). Verify:
- Default shows 5.000,00 gross / 3.130,09 net with the 13th on (Berlin, class 1, age 30).
- Typing `4000` into "Every month, net" updates all other cells, and the gross is ~6.6k; the typed cell keeps its text while typing.
- Typing `65.000` into "Year, gross" gives monthly gross 5.000,00.
- Switching the 13th off hides the November/average rows and the bonus column; the pinned number stays.
- Switching tax class with a net cell pinned keeps that net and changes the gross.
- No horizontal scroll at 390 px; focus ring visible when tabbing.
Take screenshots, critique against the spec's visual design, and fix what reads off.

- [ ] **Step 3: Run tests**

Run: `node --test`
Expected: all 32 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add the salary finder page"
```
