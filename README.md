# German gross-net calculator 2026

A static, privacy-friendly salary calculator for employees in Germany. Type any gross or net amount (monthly, average month including a 13th salary, or yearly) and every other figure is recalculated.

- Payroll tax, Solidaritätszuschlag and church tax: a cent-exact port of the official BMF Programmablaufplan 2026.
- 13th salary paid in November, taxed as a one-off payment (sonstiger Bezug), with social contributions under §23a SGB IV.
- All tax classes, children, church tax, public or private health insurance, Saxony care-insurance rates.
- €50 benefit card (Sachbezug), tax-free up to the limit and fully taxed above it.
- Gross → net curve showing how much of each extra euro you keep.
- English (`/`) and German (`/de/`) pages; German browsers are sent to `/de/` on their first visit. Everything runs in the browser, with no requests to third parties.
- "Copy link" puts the salary and settings in the URL, so two offers can be compared side by side.
- Four themes (Slate & Mint, Midnight Terminal, Bauhaus, Lavender Dusk); pick one for light and one for dark, or force a mode.

## Run

Open `index.html` in a browser.

## Build

`index.html` is the source. After changing it or the text in `i18n.js`, run:

```bash
node build.js
```

This writes the interface text and the search-engine metadata (title, description, canonical, hreflang, Open Graph, structured data) into `index.html` (English, the default page) and `de/index.html` (German). It also builds the explanation pages `how-it-works/` and `de/so-wird-gerechnet/` from the text in `_guide/`, with the calculator's styles and a worked example computed by `tax.js`, and writes `sitemap.xml`. The test suite fails while any of these is out of date.

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
4. Update the rates, caps and thresholds quoted in `_guide/en.html` and `_guide/de.html`.
5. Run `node build.js`: titles, descriptions, page text and the worked example take their values from `tax.js`. Regenerate `og-en.png` and `og-de.png`, which show the year.

## License notes

The fonts in `fonts/` (IBM Plex Sans, Manrope, Barlow Semi Condensed, Work Sans, Figtree) are licensed under the SIL Open Font License (`fonts/OFL.txt`, notices in `fonts/LICENSES.md`).
