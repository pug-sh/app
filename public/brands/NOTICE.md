# Brand icon provenance

Browser, OS and device marks. Every glyph in this directory identifies the product it depicts —
a Firefox mark on a row labelled "Firefox". That is nominative use, and it is the basis on which
all of these are included. **All logos and trademarks are the property of their respective
owners.**

Where a source publishes a copyright licence for the artwork, it is named below. Where it does
not, none is granted and the entry rests on nominative use alone — which is the same footing
every icon set takes: both Simple Icons and browser-logos licence their tooling and explicitly
exclude the logos from it.

Keep this file in step with `src/lib/brand-icon-assets.ts`; an icon added there wants a row here.
SDK language and framework marks live separately, under `public/sdk/`.

## Requires attribution

- **android.svg** — [Simple Icons], **CC BY 3.0**. Modified: tinted to the brand hex, `<title>`
  stripped. Per [Google's brand guidelines], the required notice is:

  > The Android robot is reproduced or modified from work created and shared by Google and used
  > according to terms described in the Creative Commons 3.0 Attribution License.

- **ios.svg** — [devicon] 2.17.0 (`icons/apple/apple-original.svg`), **MIT**, © 2015 konpa. MIT
  requires the notice be kept, hence this row. Modified: tinted `#007AFF`, reformatted. The grant is
  devicon's own; the mark itself is Apple's, on the nominative-use footing above.

- **linux.svg** — Tux, by **Larry Ewing, Simon Budig and Garrett LeSage**, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tux.svg). Larry Ewing's terms grant
  use and modification provided he and The GIMP are acknowledged:

  > Attribution: Larry Ewing, Simon Budig, Garrett LeSage. Created with The GIMP.

  Modified: the 31 `<filter>` elements were removed. They are blur and shading passes that are
  invisible at 16px but were still computed on every paint, in a table that can render hundreds
  of rows. Everything else is untouched.

## Public domain

- **windows.svg** — [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Windows_logo_-_2021.svg)
- **yandex.svg** — [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Yandex_Browser_icon.svg)

## No copyright licence granted — trademark of the owner

- **safari.svg** — [Simple Icons]; no licence data published. Modified: tinted to the brand hex,
  `<title>` stripped.
- **brave.svg**, **chrome.svg**, **chromium.svg**, **coccoc.png**, **opera.svg**,
  **samsung-internet.svg**, **uc.svg**, **vivaldi.svg** — [browser-logos]. MIT covers the
  repository; the logos are excluded from it by its own terms.
- **duckduckgo.svg** — DuckDuckGo's [privacy extension repo][ddg] (Apache-2.0 repository).

## Ours

- **macos.svg** — hand-authored in this repo.

## Unverified

Both predate this audit, and both are byte-identical to the files first committed — neither is
devicon's, which is what the obvious guess would be: devicon ships no Edge icon at all, and its
Firefox is the *retired* logo.

- **edge.svg** — a 24-viewBox path with an injected `fill`, which is the [Simple Icons] treatment
  every other entry here got, but the upstream entry is unconfirmed. Not upgraded on a resemblance.
- **firefox.svg** — 512×512 with radial gradients, i.e. Mozilla's current mark. Source unconfirmed.

[Simple Icons]: https://github.com/simple-icons/simple-icons
[browser-logos]: https://github.com/alrra/browser-logos
[devicon]: https://github.com/devicons/devicon
[ddg]: https://github.com/duckduckgo/duckduckgo-privacy-extension
[Google's brand guidelines]: https://developer.android.com/distribute/marketing-tools/brand-guidelines#brand-android
