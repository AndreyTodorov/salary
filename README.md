# German gross-to-net calculator 2026

A static, privacy-friendly salary calculator for employees in Germany. Type any gross or net amount (monthly, average month including a 13th salary, or yearly) and every other figure is recalculated.

- Payroll tax, Solidaritätszuschlag and church tax: a cent-exact port of the official BMF Programmablaufplan 2026.
- 13th salary paid in November, taxed as a one-off payment (sonstiger Bezug), with social contributions under §23a SGB IV.
- All tax classes, children, church tax, public or private health insurance, Saxony care-insurance rates.
- €50 benefit card (Sachbezug), tax-free up to the limit and fully taxed above it.
- Gross → net curve showing how much of each extra euro you keep.
- English and German interface; everything runs in the browser, with no requests to third parties.
- "Copy link" puts the salary and settings in the URL, so two offers can be compared side by side.

## Run

Open `index.html` in a browser. No build step.

## Test

```bash
node --test
```

The tests compare against values from the BMF's official calculator.

## Publish on GitHub Pages

Push to GitHub, then Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.

## Updating to a new tax year

1. Get the new `Lohnsteuer<year>.xml` pseudocode from the BMF.
2. In `tax.js`, update the `Y` block and the coefficients in `tariff()`.
3. Replace the BMF reference values in `tax.test.js` (BMF test interface) and run `node --test`.
4. Update the year in the static `<title>` and meta tags of `index.html`.

## License notes

The Archivo font in `fonts/` is licensed under the SIL Open Font License (`fonts/OFL.txt`).
