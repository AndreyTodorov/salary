/* German salary calculator, tax year 2026.
   Lohnsteuer is a port of the BMF Programmablaufplan 2026 (Lohnsteuer2026.xml, Stand 2025-10-23),
   limited to employees without Versorgungsbezüge, Altersentlastungsbetrag, Freibeträge or
   Entschädigungen, factor f = 1, ALV = 0, KRV = 0.
   Money is integer cents. Rates are integers in 1/100000.
   Yearly update: see the Y block. */
(function (root) {
  'use strict';

  const RATE = 100000;

  // Tax year 2026. Amounts in cents unless marked as euros; rates in 1/100000.
  // Yearly update: change this block and the coefficients in tariff(), then the BMF values in tax.test.js.
  const Y = {
    YEAR: 2026,
    GFB: 12348, SOLZFREI: 20350,                     // euros
    W1STKL5: 14071, W2STKL5: 34939, W3STKL5: 222260, // euros
    KFB: 9756, KFB_IV: 4878,                         // euros per child allowance
    ANP: 123000, SAP: 3600, EFA: 426000, VSPHB_MAX: 190000,
    BBGRVALV: 10140000, BBGKVPV: 6975000,
    BBG_RV_MONTH: 845000, BBG_KV_MONTH: 581250,
    JAEG_YEAR: 7740000, MIDIJOB_MAX: 200000, SACHBEZUG_LIMIT: 5000,
    PKV_SUBSIDY_KV: 50859, PKV_SUBSIDY_PV: 10463, PKV_SUBSIDY_PV_SN: 7556,
    RV: 9300, ALV: 1300,
    KV: 7300, KV_TAX: 7000, // actual KV contribution vs. Vorsorgepauschale (no sick-pay share)
    PV: 1800, PV_SN: 2300, PV_CHILDLESS: 600, PV_PER_CHILD: 250,
    ZB_AVERAGE: 2.9,        // percent
  };

  // Exact for 0 <= a < 4.5e15 and positive integer b.
  const div = (a, b) => Math.floor(a / b);
  const ceilEuro = (cents) => Math.ceil(cents / 100) * 100;

  // §32a EStG 2026 (UPTAB26), x in whole euros, returns euros.
  function tariff(x) {
    if (x < Y.GFB + 1) return 0;
    if (x < 17800) {
      const y = BigInt(x - Y.GFB) * 100n; // Y in millionths
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
    if (zzx > Y.W2STKL5) {
      let st = up56(Y.W2STKL5);
      if (zzx > Y.W3STKL5) {
        st += div((Y.W3STKL5 - Y.W2STKL5) * 42, 100);
        return st + div((zzx - Y.W3STKL5) * 45, 100);
      }
      return st + div((zzx - Y.W2STKL5) * 42, 100);
    }
    const vergl = up56(zzx);
    if (zzx > Y.W1STKL5) {
      const hoch = up56(Y.W1STKL5) + div((zzx - Y.W1STKL5) * 42, 100);
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
    const vspr = div(Math.min(zre4vp, Y.BBGRVALV) * Y.RV, RATE);
    let vspkvpv;
    if (p.pkv) vspkvpv = p.stkl === 6 ? 0 : Math.max(0, p.pkpv * 12 - p.pkpvagz * 12);
    else vspkvpv = div(Math.min(zre4vp, Y.BBGKVPV) * (p.kvsatzan + p.pvsatzan), RATE);
    let vsp = ceilEuro(vspr + vspkvpv);
    if (p.stkl !== 6) {
      const vspalv = div(Math.min(zre4vp, Y.BBGRVALV) * Y.ALV, RATE);
      const vsphb = Math.min(vspalv + vspkvpv, Y.VSPHB_MAX);
      vsp = Math.max(vsp, ceilEuro(vspr + vsphb));
    }
    return vsp;
  }

  // MZTABFB + MLSTJAHR for an annual wage in cents.
  function annualTax(zre4, p) {
    const anp = p.stkl === 6 ? 0 : Math.min(ceilEuro(zre4), Y.ANP);
    const sap = p.stkl === 6 ? 0 : Y.SAP;
    const efa = p.stkl === 2 ? Y.EFA : 0;
    const zve = zre4 - (efa + anp + sap) - vorsorgepauschale(zre4, p);
    return { zve, st: incomeTax(zve, p) };
  }

  function papParams(i) {
    const stkl = i.STKL;
    const zkf = i.ZKF || 0;
    const kfbPerZ = stkl <= 3 ? Y.KFB : stkl === 4 ? Y.KFB_IV : 0;
    let pvsatzan = i.PVS ? Y.PV_SN : Y.PV;
    pvsatzan += i.PVZ ? Y.PV_CHILDLESS : -Y.PV_PER_CHILD * (i.PVA || 0);
    return {
      stkl,
      kztab: stkl === 3 ? 2 : 1,
      zkf,
      kfb: Math.floor(zkf * kfbPerZ) * 100,
      kvsatzan: Y.KV_TAX + Math.round((i.KVZ || 0) * 100) * 5,
      pvsatzan,
      pkv: !!i.PKV,
      pkpv: i.PKPV || 0,
      pkpvagz: i.PKPVAGZ || 0,
      church: !!i.R,
    };
  }

  function pap(input) {
    const p = papParams(input);
    const solzfrei = Y.SOLZFREI * p.kztab;

    // MBERECH, LZZ = 2 (month)
    const reg = annualTax((input.RE4 || 0) * 12, p);
    const lstjahr = reg.st;
    const jbmg = p.zkf > 0 ? incomeTax(reg.zve - p.kfb, p) : lstjahr;
    let solzlzz = 0;
    if (jbmg > solzfrei) {
      const solzj = Math.min(div(jbmg * 11, 2), div((jbmg - solzfrei) * 119, 10));
      solzlzz = div(solzj, 12);
    }

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
  }

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
    insurance: 'public', zusatzbeitrag: Y.ZB_AVERAGE, privatePremium: 60000, thirteenth: true, benefitCard: 0,
  };

  const roundRate = (cents, rate) => div(cents * rate + RATE / 2, RATE);

  function careRate(s) {
    const childless = s.children === 0 && s.age >= 23;
    const discount = Math.max(0, Math.min(s.children, 5) - 1) * Y.PV_PER_CHILD;
    return (s.state === 'SN' ? Y.PV_SN : Y.PV) + (childless ? Y.PV_CHILDLESS : -discount);
  }

  function pkvSubsidy(s) {
    const pv = s.state === 'SN' ? Y.PKV_SUBSIDY_PV_SN : Y.PKV_SUBSIDY_PV;
    return Math.min(div(s.privatePremium, 2), Y.PKV_SUBSIDY_KV + pv);
  }

  function papInput(s, pay, bonus) {
    const childless = s.children === 0 && s.age >= 23;
    const pkv = s.insurance === 'private';
    const perChild = s.taxClass <= 2 ? 0.5 : s.taxClass <= 4 ? 1 : 0;
    return {
      STKL: s.taxClass,
      RE4: pay,
      ZKF: s.children * perChild,
      KVZ: s.zusatzbeitrag,
      PVZ: childless ? 1 : 0,
      PVS: s.state === 'SN' ? 1 : 0,
      PVA: childless ? 0 : Math.max(0, Math.min(s.children, 5) - 1),
      PKV: pkv ? 1 : 0,
      PKPV: pkv ? s.privatePremium : 0,
      PKPVAGZ: pkv ? pkvSubsidy(s) : 0,
      R: s.church ? 1 : 0,
      JRE4: pay * 12,
      SONSTB: bonus,
    };
  }

  // Employee contributions on a contributory base; kvBase/rvBase already capped.
  function contributions(s, kvBase, rvBase, privateShare) {
    const pkv = s.insurance === 'private';
    const kvRate = Y.KV + Math.round(s.zusatzbeitrag * 100) * 5;
    return {
      health: pkv ? privateShare : roundRate(kvBase, kvRate),
      care: pkv ? 0 : roundRate(kvBase, careRate(s)),
      pension: roundRate(rvBase, Y.RV),
      unemployment: roundRate(rvBase, Y.ALV),
    };
  }

  function breakdown(gross, incomeTax, soli, church, sv, benefit) {
    const net = gross - incomeTax - soli - church - sv.health - sv.care - sv.pension - sv.unemployment;
    return { gross, incomeTax, soli, church, ...sv, benefit, net };
  }

  // §23a SGB IV: one-off payment fills the room under the pro-rata annual cap up to its month.
  function bonusBase(gross, bonus, monthCap) {
    const room = BONUS_MONTH * monthCap - BONUS_MONTH * Math.min(gross, monthCap);
    return Math.min(bonus, Math.max(0, room));
  }

  function calculate(s, gross) {
    const card = s.benefitCard || 0;
    const pay = gross + (card > Y.SACHBEZUG_LIMIT ? card : 0); // taxable and contributory monthly pay
    const b = s.thirteenth ? gross : 0;
    const r = pap(papInput(s, pay, b));
    const churchRate = s.state === 'BW' || s.state === 'BY' ? 8 : 9;
    const privateShare = s.insurance === 'private' ? s.privatePremium - pkvSubsidy(s) : 0;

    const regular = breakdown(gross, r.LSTLZZ, r.SOLZLZZ, div(r.BK * churchRate, 100),
      contributions(s, Math.min(pay, Y.BBG_KV_MONTH), Math.min(pay, Y.BBG_RV_MONTH), privateShare), card);

    const bonus = breakdown(b, r.STS, r.SOLZS, div(r.BKS * churchRate, 100),
      contributions(s, bonusBase(pay, b, Y.BBG_KV_MONTH), bonusBase(pay, b, Y.BBG_RV_MONTH), 0), 0);

    const year = {};
    for (const k of Object.keys(regular)) year[k] = regular[k] * 12 + bonus[k];

    const yearGross = gross * (s.thirteenth ? 13 : 12);
    const notes = [];
    if (gross > 0 && yearGross <= Y.MIDIJOB_MAX * 12) notes.push({ code: 'midijob', limit: Y.MIDIJOB_MAX });
    if (s.insurance === 'private' && yearGross < Y.JAEG_YEAR) notes.push({ code: 'jaeg', limit: Y.JAEG_YEAR });
    if (card > Y.SACHBEZUG_LIMIT) notes.push({ code: 'benefitTaxable', limit: Y.SACHBEZUG_LIMIT });

    return {
      regular,
      bonus,
      november: { gross: regular.gross + bonus.gross, net: regular.net + bonus.net },
      average: { gross: Math.round(year.gross / 12), net: Math.round(year.net / 12) },
      year,
      notes,
    };
  }

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

  // Saved page state from localStorage: keep only valid values, fall back to DEFAULTS.
  function restore(saved) {
    const src = (saved && saved.settings) || {};
    const ok = {
      taxClass: (v) => Number.isInteger(v) && v >= 1 && v <= 6,
      state: (v) => STATES.some(([code]) => code === v),
      church: (v) => typeof v === 'boolean',
      age: (v) => Number.isInteger(v) && v >= 15 && v <= 99,
      children: (v) => Number.isInteger(v) && v >= 0 && v <= 6,
      insurance: (v) => v === 'public' || v === 'private',
      zusatzbeitrag: (v) => Number.isFinite(v) && v >= 0 && v <= 10,
      privatePremium: (v) => Number.isInteger(v) && v >= 0 && v <= 1000000,
      thirteenth: (v) => typeof v === 'boolean',
    };
    const settings = { ...DEFAULTS };
    for (const k of Object.keys(ok)) if (ok[k](src[k])) settings[k] = src[k];
    const a = saved && saved.anchor;
    const anchor = a && FIELDS.includes(a.field) && Number.isInteger(a.cents) && a.cents >= 0
      ? { field: a.field, cents: a.cents } : null;
    return { settings, anchor };
  }

  const api = { Y, pap, calculate, solve, read, parseAmount, pkvSubsidy, restore, DEFAULTS, STATES, FIELDS, MAX_GROSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SalaryTax = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
