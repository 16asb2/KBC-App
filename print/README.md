# print/

Things meant to come out of a printer, not a browser. Nothing here is deployed
to either hosting site or bundled into `web/`.

## The app poster

One US Letter page for the gym wall: a large QR code to the app, an overview of
what the app is for, and add-to-home-screen steps for iPhone and Android. Two
copies, same content:

| | |
|---|---|
| `kbc-app-poster.pdf` | **Print this one.** Fixed at 8.5 × 11in, every glyph embedded, nothing fetched at print time. |
| `kbc-app-poster.html` | The same page in the browser. Needs the network for its webfonts, and depends on the print dialog being set right. |

The PDF is the one to send to whoever is printing. Every font the page draws is
inside it — the static faces as TrueType programs, the variable one as Type3
glyph outlines — so it comes out the same on a machine that has never heard of
Archivo Black and on one with no internet. Both are regenerated together, so
they cannot drift.

Printing the HTML instead: **100% scale, US Letter, no page scaling and no
margins** — the sheet sets its own 8.5 × 11in with `@page { margin: 0 }` and
carries its own white space, so letting the browser add margins on top shrinks
it. The PDF needs none of that care, which is why it exists.

### Regenerating it

It is generated, not hand-edited. Edit `poster.template.html`, then:

```bash
cd scripts && npm install     # once — the generator needs `qrcode`
cd ../print && node build-poster.mjs
```

`build-poster.mjs` writes both files. It inlines two things into the template:
the QR code as SVG, and `web/public/kbc-logo.png` as a data URI. Both
deliberately — a poster gets printed from whatever laptop is to hand, and a page
that fetches anything at print time is a page that can print with a hole in it.
The HTML's one remaining request is the Google Fonts stylesheet, which has real
fallback stacks behind it; the PDF has none at all.

It is a generator rather than a checked-in file for one reason: a QR code is two
kilobytes of path data that nobody can proofread. If the app's URL changes,
regenerating is correct and retyping is not.

```bash
node build-poster.mjs --url https://climb.example.org   # point it somewhere else
node build-poster.mjs --no-pdf                          # HTML only
node build-poster.mjs --body-only                       # no <head>/<body>, for publishing as a page
```

The PDF step drives whatever Chrome or Edge it can find, or `CHROME_PATH`. A
machine with neither gets the HTML and a warning rather than a failure — and
the committed PDF stays as it was, which is the one case where the two files
can drift. It also asserts the output is a single 612 × 792pt page and exits
non-zero if an edit has pushed the poster onto a second sheet, since that is
otherwise discovered at the printer.

The QR encodes `https://kbc-app-3307b.web.app` — the `web` hosting target in
`.firebaserc`. It uses error-correction level **H**, so 30% of the symbol can be
damaged and still read, which is the right trade for something taped to a wall
next to a chalk bucket. Even at H the URL is short enough to fit 33 modules, so
the printed squares stay large: roughly 1.7mm each at this size.

### If you change the app's URL

Regenerate, and check the new QR before printing a stack. `build-poster.mjs`
prints the version and module count it produced; a much larger symbol means a
much longer URL, and the modules shrink accordingly.
