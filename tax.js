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

  const api = { pap, calculate, DEFAULTS, STATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SalaryTax = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
