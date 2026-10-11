# German salary calculator with 13th month — design

## Goal

A personal tool for finding a target salary. Enter any of: regular monthly gross/net, average monthly gross/net (13th month spread over 12), or yearly gross/net — every other figure updates. Based on the All About Berlin tax calculator, extended with a 13th salary. Employees only, tax year 2026.

Success: monthly Lohnsteuer, Soli and the 13th-salary tax match the official BMF calculator to the cent for the reference cases below; reverse entry (net → gross) lands on the entered value within €0.01 where reachable.

## Delivery

- Static site in the repo root, hosted on GitHub Pages; also works opened from disk (`file://`).
- `index.html` — UI, inline CSS and UI script.
- `tax.js` — pure calculation logic, classic script (no ES modules, so `file://` works). Exposes `window.SalaryTax` in the browser and `module.exports` in Node.
- `tax.test.js` — `node --test`, no dependencies.
- No build step, no npm dependencies. One Google Font.

## Inputs

| Input | Values | Default |
|---|---|---|
| Tax class | I–VI | I |
| Federal state | 16 states | Berlin |
| Church tax | yes / no | no |
| Age | number | 30 |
| Children | 0–6 (assumed under 25) | 0 |
| Health insurance | public / private | public |
| Zusatzbeitrag (public) | % | 2.9 |
| Monthly premium incl. PV (private) | € | 600 |
| 13th salary | on / off | on |

The 13th salary is exactly one regular monthly gross, paid once in November.

## Outputs

Editable grid (any cell can be typed into; the rest recompute):

| | Gross | Net |
|---|---|---|
| Regular month | edit | edit |
| November with 13th | read-only | read-only |
| Average month (year ÷ 12) | edit | edit |
| Year | edit | edit |

With the 13th salary off, the November and average rows are hidden (average = regular).

Breakdown table: rows Lohnsteuer, Soli, Kirchensteuer, Krankenversicherung, Pflegeversicherung, Rentenversicherung, Arbeitslosenversicherung, net; columns Regular month, 13th salary payment, Year.

Year chart: 12 bars, net per month, November showing the regular and bonus parts stacked.

## Calculation

All money in integer cents. Port of the official BMF PAP 2026 pseudocode (`Lohnsteuer2026.xml`, Stand 2025-10-23), limited to the branches we use: no Versorgungsbezüge, no Altersentlastungsbetrag, no Freibeträge/Hinzurechnungen, no Entschädigungen, factor = 1.

### Regular month (PAP, LZZ = 2)

- Constants: GFB 12,348; tariff zones per §32a 2026 (UPTAB26); BBG RV/ALV 101,400; BBG KV/PV 69,750; SOLZFREI 20,350; W1/W2/W3 STKL5 14,071 / 34,939 / 222,260; ANP 1,230; SAP 36; EFA (class II) 4,260; KFB per child 9,756 (classes I–III), 4,878 (IV), 0 (V, VI).
- Vorsorgepauschale: RV part 9.3% (capped), KV/PV part at employee rates incl. half Zusatzbeitrag (capped) or for PKV 12 × (premium − employer subsidy); 2026 rule MVSPHB with the 1,900 cap including ALV.
- Soli with Freigrenze and 11.9% Milderung; church tax base = Lohnsteuer recomputed with Kinderfreibeträge.
- PAP inputs derived from the UI: STKL, ZKF = 0.5 per child in classes I–II (unmarried parents share the allowance), 1.0 per child in III–IV, 0 in V–VI, KVZ, PVZ = age ≥ 23 and no children, PVA = max(0, min(children, 5) − 1), PVS = Saxony, PKV, PKPV, PKPVAGZ, R = church.

### 13th salary (PAP MSONST)

- JRE4 = 12 × monthly gross (no earlier one-off payments in the year), SONSTB = monthly gross.
- STS = annual tax(JRE4 + SONSTB) − annual tax(JRE4), Vorsorgepauschale recomputed on the higher wage; Soli on STS at 5.5% if the Freigrenze test on the total is exceeded (no Milderung); church tax on STS.

### Social security (employee share, 2026)

- KV 7.3% + Zusatzbeitrag/2; PV 1.8% (+0.6% childless from 23; −0.25% per child 2–5; Saxony 2.3% base); RV 9.3%; ALV 1.3%.
- Monthly caps: KV/PV 5,812.50; RV/ALV 8,450.
- Each contribution rounded to the cent per payment.
- 13th salary (§23a SGB IV): per branch, base = min(bonus, max(0, 11 × monthly cap − 11 × min(gross, monthly cap))).
- Private: employee pays premium − subsidy; subsidy = min(premium/2, 508.59 + 104.63). KV/PV contributions are 0. Note shown when monthly gross < JAEG 6,450.

### Reverse entry

Monthly gross is the single source of truth. Editing another cell runs a binary search on the monthly gross in cents (0 to 1,000,000 €), then scans ±2 € around the result for the value whose output is closest to the entry (net has cent-level dips where the annual tax steps up a euro). The last typed value stays fixed when settings change.

## Out of scope

Mini/Midijob (note shown below €2,000 gross), self-employed, students, the class IV factor method, tax refunds from the annual return, Kirchensteuer-Kappung, any 13th-salary month other than November.

## Tests (official BMF test interface values, KVZ 2.90)

| Case | Expected |
|---|---|
| I, 3,000, childless | LSt 293.08, Soli 0, net 2,054.42 |
| I, 5,000, childless | LSt 782.41, net 3,130.09 |
| I, 8,000, childless | LSt 1,810.33, Soli 13.62, net 4,679.96 |
| I, 12,000 | LSt 3,472.75, Soli 191.00 |
| I, 5,000, PVZ 0, 1 child, church | LSt 792.58, church base 529.25 |
| II, 5,000, 1 child, church | LSt 674.25, church base 422.91 |
| III, 5,000 | LSt 401.83 |
| V, 3,000 | LSt 625.66 |
| VI, 3,000 | LSt 665.00 |
| I, 8,000, PKV 600 / subsidy 300 | LSt 1,949.16, Soli 30.14 |
| 13th, I, 3,000 | STS 664.00, Soli 0 |
| 13th, I, 5,000, church | STS 1,383.00, Soli 0 |
| 13th, I, 8,000 | STS 3,149.00, Soli 173.19 |
| SV on 13th at 8,000 | KV/PV 0, RV/ALV base 4,950 |
| Reverse: net 3,130.09 → gross 5,000.00 | exact |

## Visual design

Subject: a payslip, re-imagined as an instrument for finding a number. Audience: one person comparing offers, on phone and desktop.

- **Palette:** paper `#F2F4F1` (green-grey), ink `#1C2A28`, net/kept `#0E7A5C` (euro-note green), tax `#7D4A73` (plum), social `#4C6A8C` (slate blue), bonus `#E0A12B` (amber, used only for the 13th month). Dark theme derived from the same hues.
- **Type:** Archivo (variable width) as the single family. Tabular figures everywhere; large results set in a condensed width, labels in normal width. No all-caps labels.
- **Memorable element:** the year strip — 12 bars, November visibly taller in amber. It's the one bold moment; the rest stays quiet.
- **Layout:** mobile-first single column (grid → year strip → settings → breakdown). From ~900px: settings in a sticky left column, results on the right. Left-aligned.
- **Interaction:** the edited cell keeps focus; other cells update live with a brief highlight of what changed. Respects reduced motion, visible keyboard focus, German number input accepted (`5.000,50` and `5000.50`).

---

## Revision 2 (2026-10-11): improvements, curve, benefit card, German UI

Approved after the independent review. Supersedes the sections above where they conflict.

### Calculation

- **Year constants** live in one `Y` block in `tax.js` (plus the tariff coefficients right below it). UI copy that names the year or limits takes them from `SalaryTax.Y`.
- **Notes** are codes with parameters (`{ code, limit }`), translated in the UI:
  - `jaeg`: private insurance and yearly gross (13 × gross with the 13th, else 12 ×) below JAEG 77,400 €.
  - `midijob`: average monthly gross (yearly ÷ 12) at or below 2,000 €.
  - `benefitTaxable`: benefit card above 50 €.
- **Benefit card (Sachbezug, §8 Abs. 2 Satz 11 EStG):** setting `benefitCard` (cents per month, 0–1,000 €, default 0).
  - Up to 50 €: tax- and contribution-free.
  - Above 50 € (Freigrenze): the whole amount is added to taxable and contributory monthly pay (RE4, JRE4, SV base, §23a room). It is not added to the 13th salary.
  - Breakdown gains `benefit`; `net` stays cash paid out. The UI shows "net incl. benefit card" = net + benefit.
- **Targets mean "at least":** `solve` returns the lowest monthly gross whose value reaches the target. After bisection it scans 80 € of monthly gross below the result, to cross the Soli cliff on the 13th salary.
- **Amount parsing:**
  - `65,000` / `1,234,567` are thousands.
  - A decimal part has at most 2 digits (`5000.123` → invalid).
  - Thousands groups must be valid.
- **Tax class 2 requires at least one child:** `normalize()` maps class 2 with 0 children to class 1. The UI disables class 2 while children = 0.
- **Restore** also validates `benefitCard` and `lang` (`en` | `de`).

### UI

- **Gross → net curve** replaces the year bars.
  - Monthly net (solid green) and average-month net (dashed amber, only with the 13th) over gross from 0 to max(8,000 €, 2 × gross).
  - Faint vertical lines at the KV/PV cap (5,812.50 €) and the RV/ALV cap (8,450 €).
  - A marker shows the current salary.
  - Hover or tap shows gross, net and "keeps X ct per extra €". Click sets the monthly gross (rounded to 10 €).
  - Caption: marginal keep at the current salary and the net effect of +500 € gross.
- **Benefit card** setting, a line under the grid, and breakdown rows "Benefit card" and "Net incl. benefit card" (shown when > 0).
- **English / German toggle** in the header.
  - Defaults to the browser language; remembered.
  - All copy translated, formal "Sie" in German.
  - Numbers stay `de-DE` in both languages.
- **Assumptions** (collapsible) under the breakdown, also printed:
  - withheld tax vs. annual assessment
  - 13th = one monthly gross, in November
  - children under 25; ZKF 0.5 in classes I/II, 1.0 in III/IV
  - PKV premium treated as basic cover; subsidy cap
  - out-of-scope cases
- **Pinned copy:** "Pinned: monthly net. Changing settings keeps this number and recalculates the rest." with a swatch of the pinned underline. If the 13th is switched off while an average-month cell is pinned, the pin moves to the matching monthly figure.
- **Accessibility:**
  - Editable-cell underline and switch track at ≥ 3:1 contrast.
  - A polite live region announces monthly and yearly gross/net after typing pauses.
  - Escape reverts the cell being edited.
- **Font self-hosted:** `fonts/archivo-latin.woff2` plus `fonts/OFL.txt`. No third-party requests.
- **Print stylesheet:** figures, a one-line settings summary, curve, breakdown, notes, assumptions. Controls hidden.
- Open Graph title/description, `<noscript>` message, breakdown table scrolls inside its box on narrow screens, no change-flash on first render.
- Repo: `.gitignore`, `README.md`.

---

## Revision 3 (2026-10-11): summer bonus, settings regrouped

### Summer bonus

- **Settings:**
  - `summerBonus` (on/off, default off)
  - `summerMode`: `percent` of monthly gross (`summerPercent`, 0–200, default 50) or `fixed` (`summerAmount`, default 1,500 €)
  - `summerMonth`: 4–10 (April–October, default June). Restricting to April–October avoids the März-Klausel and keeps it before the 13th salary.
- **Tax:** a sonstiger Bezug in its month (MSONST with JRE4 = 12 × pay). For the 13th salary in November, JRE4 = 12 × pay + summer bonus, because the PAP adds earlier sonstige Bezüge to JRE4.
- **Social contributions:** §23a room up to its month. The 13th salary's room is reduced by the summer bonus's contributory part, per branch.
- **Totals:** year = 12 × regular + summer + 13th; average = year ÷ 12. JAEG and midijob checks include the summer bonus.
- **UI:**
  - grid row "<month> with summer bonus"
  - breakdown column "Summer bonus"
  - the curve's dashed line is "Average month incl. bonuses"
  - amber marks extra payments (13th salary and summer bonus)

### Settings

- The 13th salary switch reads "Receives 13th salary" (DE: "Erhält ein 13. Gehalt").
- "About you" is grouped:
  - **Personal:** age, children, tax class, church tax, where you work
  - **Health insurance:** public/private, then Zusatzbeitrag or premium
  - **Extra pay:** 13th salary, summer bonus, benefit card
- The breakdown table's label column stays sticky when the numbers scroll sideways on narrow screens.
