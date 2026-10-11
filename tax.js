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
    AGE_NOTE: 64,           // Altersentlastungsbetrag and Aktivrente are not modelled from this age
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
    ['BW', 'Baden-Württemberg', 'Baden-Württemberg'], ['BY', 'Bavaria', 'Bayern'], ['BE', 'Berlin', 'Berlin'],
    ['BB', 'Brandenburg', 'Brandenburg'], ['HB', 'Bremen', 'Bremen'], ['HH', 'Hamburg', 'Hamburg'],
    ['HE', 'Hesse', 'Hessen'], ['MV', 'Mecklenburg-Western Pomerania', 'Mecklenburg-Vorpommern'],
    ['NI', 'Lower Saxony', 'Niedersachsen'], ['NW', 'North Rhine-Westphalia', 'Nordrhein-Westfalen'],
    ['RP', 'Rhineland-Palatinate', 'Rheinland-Pfalz'], ['SL', 'Saarland', 'Saarland'], ['SN', 'Saxony', 'Sachsen'],
    ['ST', 'Saxony-Anhalt', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein', 'Schleswig-Holstein'],
    ['TH', 'Thuringia', 'Thüringen'],
  ];

  // Tax class 2 (single parent) needs at least one child.
  function normalize(s) {
    return s.taxClass === 2 && s.children === 0 ? { ...s, taxClass: 1 } : s;
  }

  const DEFAULTS = {
    taxClass: 1, state: 'BE', church: false, age: 30, children: 0, olderChildren: false,
    insurance: 'public', zusatzbeitrag: Y.ZB_AVERAGE, privatePremium: 60000, thirteenth: true, benefitCard: 0,
    summerBonus: false, summerMode: 'percent', summerPercent: 50, summerAmount: 150000, summerMonth: 6,
  };

  const roundRate = (cents, rate) => div(cents * rate + RATE / 2, RATE);

  // § 55 SGB XI: the surcharge is for people who never had children; parents are exempt whatever their
  // children's age. `children` counts children under 25 (they set the discount); `olderChildren` marks
  // parents whose children are all 25 or older. People born before 1940 are exempt too: at 87 or older
  // in the tax year they certainly are (at 86 it depends on the birthday).
  const isChildless = (s) => s.children === 0 && !s.olderChildren && s.age >= 23 && s.age < Y.YEAR - 1939;

  function careRate(s) {
    const childless = isChildless(s);
    const discount = Math.max(0, Math.min(s.children, 5) - 1) * Y.PV_PER_CHILD;
    return (s.state === 'SN' ? Y.PV_SN : Y.PV) + (childless ? Y.PV_CHILDLESS : -discount);
  }

  function pkvSubsidy(s) {
    const pv = s.state === 'SN' ? Y.PKV_SUBSIDY_PV_SN : Y.PKV_SUBSIDY_PV;
    return Math.min(div(s.privatePremium, 2), Y.PKV_SUBSIDY_KV + pv);
  }

  function papInput(s, pay, bonus) {
    const childless = isChildless(s);
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
  // `used` is the contributory part of earlier one-off payments this year.
  function bonusBase(pay, bonus, month, monthCap, used) {
    const room = month * monthCap - month * Math.min(pay, monthCap) - used;
    return Math.min(bonus, Math.max(0, room));
  }

  function calculate(s, gross) {
    const card = s.benefitCard || 0;
    const pay = gross + (card > Y.SACHBEZUG_LIMIT ? card : 0); // taxable and contributory monthly pay
    const b = s.thirteenth ? gross : 0;
    const sb = !s.summerBonus ? 0 : s.summerMode === 'fixed' ? s.summerAmount : div(gross * s.summerPercent + 50, 100);
    // The summer bonus (April–October) comes first; when the 13th salary is taxed in November,
    // the summer bonus counts as already paid (PAP: earlier sonstige Bezüge are added to JRE4).
    const rS = pap(papInput(s, pay, sb));
    const rB = pap({ ...papInput(s, pay, b), JRE4: pay * 12 + sb });
    const churchRate = s.state === 'BW' || s.state === 'BY' ? 8 : 9;
    const church = (bk) => div(bk * churchRate, 100);
    // A private premium is paid, and subsidised, through the main job, not through a second one in class 6.
    const privateShare = s.insurance === 'private' && s.taxClass !== 6 ? s.privatePremium - pkvSubsidy(s) : 0;

    const regular = breakdown(gross, rS.LSTLZZ, rS.SOLZLZZ, church(rS.BK),
      contributions(s, Math.min(pay, Y.BBG_KV_MONTH), Math.min(pay, Y.BBG_RV_MONTH), privateShare), card);

    const m = s.summerMonth;
    const sKv = bonusBase(pay, sb, m, Y.BBG_KV_MONTH, 0), sRv = bonusBase(pay, sb, m, Y.BBG_RV_MONTH, 0);
    const summer = breakdown(sb, rS.STS, rS.SOLZS, church(rS.BKS), contributions(s, sKv, sRv, 0), 0);

    const bonus = breakdown(b, rB.STS, rB.SOLZS, church(rB.BKS), contributions(s,
      bonusBase(pay, b, BONUS_MONTH, Y.BBG_KV_MONTH, sKv), bonusBase(pay, b, BONUS_MONTH, Y.BBG_RV_MONTH, sRv), 0), 0);

    const year = {};
    for (const k of Object.keys(regular)) year[k] = regular[k] * 12 + summer[k] + bonus[k];

    const yearPay = pay * 12 + b + sb; // contributory yearly pay, incl. a taxable benefit card
    const notes = [];
    if (gross > 0 && yearPay <= Y.MIDIJOB_MAX * 12) notes.push({ code: 'midijob', limit: Y.MIDIJOB_MAX });
    if (s.insurance === 'private' && yearPay < Y.JAEG_YEAR) notes.push({ code: 'jaeg', limit: Y.JAEG_YEAR });
    if (card > Y.SACHBEZUG_LIMIT) notes.push({ code: 'benefitTaxable', limit: Y.SACHBEZUG_LIMIT });
    if (s.age >= Y.AGE_NOTE) notes.push({ code: 'age64', limit: Y.AGE_NOTE });

    return {
      regular,
      bonus,
      summer,
      november: { gross: regular.gross + bonus.gross, net: regular.net + bonus.net },
      summerMonth: { gross: regular.gross + summer.gross, net: regular.net + summer.net },
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

  // Largest drop a field can take as gross rises: once the Soli Freigrenze is crossed, 5.5 % Soli is
  // due on the whole tax of the one-off payments (at most 45 % of them). Monthly and gross fields
  // have no such cliff; 3 € covers the dips when the annual tax steps up a euro.
  function cliff(s, gross, field) {
    if (!field.endsWith('Net') || field === 'monthlyNet') return 300;
    const r = calculate(s, gross);
    const soli = div((r.bonus.gross + r.summer.gross) * 55 * 45, 10000);
    return 300 + (field === 'yearNet' ? soli : div(soli, 12));
  }

  // Lowest monthly gross whose field value reaches the target. Values rise with gross, but drop
  // at the Soli cliff on the one-off payments and by up to a euro whenever the annual tax steps
  // (a sawtooth with a period of 20-60 ct of gross). After bisecting, step down in 20 ct while the
  // value stays within the cliff of the target, then scan the last 2 € cent by cent.
  const STEP = 20, TAIL = 200;
  function solve(s, field, target) {
    const f = (g) => read(calculate(s, g), field);
    if (target <= 0) return 0;
    if (f(MAX_GROSS) < target) return MAX_GROSS;
    let lo = 0, hi = MAX_GROSS;
    while (lo < hi) {
      const mid = div(lo + hi, 2);
      if (f(mid) < target) lo = mid + 1; else hi = mid;
    }
    const drop = cliff(s, lo, field);
    let found = lo;
    for (let g = lo - STEP; g >= 0; g -= STEP) {
      const v = f(g);
      if (v >= target) found = g;
      else if (v < target - drop) break;
    }
    for (let g = Math.max(0, found - TAIL); g < found; g++) if (f(g) >= target) return g;
    return found;
  }

  // "5.000,50", "5000.50", "5,000.50", "65,000", "5 000 €" → cents; null if not a valid amount.
  function parseAmount(text) {
    const t = String(text).replace(/[\s€\u00a0]/g, '');
    if (!/^\d[\d.,]*$/.test(t)) return null;
    let cents;
    if (/^\d+$/.test(t)) cents = Number(t) * 100;
    else if (/^\d{1,3}(\.\d{3})+$/.test(t) || /^\d{1,3}(,\d{3})+$/.test(t)) cents = Number(t.replace(/[.,]/g, '')) * 100;
    else {
      const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
      const int = t.slice(0, i), dec = t.slice(i + 1), group = t[i] === ',' ? '\\.' : ',';
      if (dec.length > 2 || /[.,]/.test(dec)) return null;
      if (!new RegExp(`^(\\d+|\\d{1,3}(${group}\\d{3})+)$`).test(int)) return null;
      cents = Number(int.replace(/[.,]/g, '')) * 100 + Number(dec.padEnd(2, '0'));
    }
    return Number.isSafeInteger(cents) ? cents : null;
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
      olderChildren: (v) => typeof v === 'boolean',
      insurance: (v) => v === 'public' || v === 'private',
      zusatzbeitrag: (v) => Number.isFinite(v) && v >= 0 && v <= 10,
      privatePremium: (v) => Number.isInteger(v) && v >= 0 && v <= 1000000,
      thirteenth: (v) => typeof v === 'boolean',
      summerBonus: (v) => typeof v === 'boolean',
      summerMode: (v) => v === 'percent' || v === 'fixed',
      summerPercent: (v) => Number.isInteger(v) && v >= 0 && v <= 200,
      summerAmount: (v) => Number.isInteger(v) && v >= 0 && v <= 10000000,
      summerMonth: (v) => Number.isInteger(v) && v >= 4 && v <= 10,
      benefitCard: (v) => Number.isInteger(v) && v >= 0 && v <= 100000,
    };
    const settings = { ...DEFAULTS };
    for (const k of Object.keys(ok)) if (ok[k](src[k])) settings[k] = src[k];
    const a = saved && saved.anchor;
    const anchor = a && FIELDS.includes(a.field) && Number.isInteger(a.cents) && a.cents >= 0
      ? { field: a.field, cents: a.cents } : null;
    const lang = saved && (saved.lang === 'en' || saved.lang === 'de') ? saved.lang : null;
    return { settings: normalize(settings), anchor, lang };
  }

  // Share link: { settings, anchor, lang } <-> URL query. Only settings that differ from DEFAULTS
  // are written. decodeState returns the saved-state shape for restore() to validate.
  function encodeState({ settings, anchor, lang }) {
    const q = new URLSearchParams();
    if (anchor) { q.set('f', anchor.field); q.set('c', String(anchor.cents)); }
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'olderChildren' && settings.children > 0) continue; // only matters without children under 25
      if (settings[k] !== DEFAULTS[k]) q.set(k, String(settings[k]));
    }
    if (lang) q.set('lang', lang);
    return q.toString();
  }
  function decodeState(query) {
    const q = new URLSearchParams(query);
    const settings = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (!q.has(k)) continue;
      const v = q.get(k);
      const d = DEFAULTS[k];
      settings[k] = typeof d === 'boolean' ? v === 'true' : typeof d === 'number' ? Number(v) : v;
    }
    const anchor = q.has('f') ? { field: q.get('f'), cents: Number(q.get('c')) } : null;
    return { settings, anchor, lang: q.get('lang') };
  }

  const api = { Y, pap, calculate, solve, read, parseAmount, pkvSubsidy, restore, normalize, encodeState, decodeState, DEFAULTS, STATES, FIELDS, MAX_GROSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SalaryTax = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
