# print/

Things meant to come out of a printer, not a browser. Nothing here is deployed
to either hosting site or bundled into `web/`.

## `kbc-app-poster.html` — the app poster

One US Letter page for the gym wall: a large QR code to the app, a line about
what the app is for, and add-to-home-screen steps for iPhone and Android.

Open it and print at **100% scale, US Letter, no page scaling and no margins**
— the sheet sets its own 8.5 × 11in with `@page { margin: 0 }` and carries its
own white space, so letting the browser add margins on top shrinks it. The page
prints as a single sheet; if a preview shows two, something has been edited past
what fits.

### Regenerating it

It is generated, not hand-edited. Edit `poster.template.html`, then:

```bash
cd scripts && npm install     # once — the generator needs `qrcode`
cd ../print && node build-poster.mjs
```

`build-poster.mjs` inlines two things into the template: the QR code as SVG,
and `web/public/kbc-logo.png` as a data URI. Both deliberately — a poster gets
printed from whatever laptop is to hand, and a page that fetches anything at
print time is a page that can print with a hole in it. The only network request
in the output is the Google Fonts stylesheet, which has real fallback stacks
behind it.

It is a generator rather than a checked-in file for one reason: a QR code is two
kilobytes of path data that nobody can proofread. If the app's URL changes,
regenerating is correct and retyping is not.

```bash
node build-poster.mjs --url https://climb.example.org   # point it somewhere else
node build-poster.mjs --body-only                       # no <head>/<body>, for publishing as a page
```

The QR encodes `https://kbc-app-3307b.web.app` — the `web` hosting target in
`.firebaserc`. It uses error-correction level **H**, so 30% of the symbol can be
damaged and still read, which is the right trade for something taped to a wall
next to a chalk bucket. Even at H the URL is short enough to fit 33 modules, so
the printed squares stay large: roughly 1.7mm each at this size.

### If you change the app's URL

Regenerate, and check the new QR before printing a stack. `build-poster.mjs`
prints the version and module count it produced; a much larger symbol means a
much longer URL, and the modules shrink accordingly.
