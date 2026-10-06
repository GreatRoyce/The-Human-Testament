# Home and Navbar review

Reviewed on 2026-10-01. This covers the seven sections rendered by `Home.jsx`, their card components, and the shared Navbar. It is a source and server-render review, not an accessibility certification or a browser visual audit.

## Changes

| Area | Findings addressed |
| --- | --- |
| Home | Added one main landmark and a target for the skip link. |
| Navbar | Replaced inert navigation labels with links to existing sections. Added a native mobile disclosure, Escape-to-close with focus restoration, visible keyboard focus, and a home link on the logo. Search and sign-in are explicitly unavailable until implemented. |
| Hero | Removed fixed-height clipping, made typography and actions responsive, allowed statistics to wrap, and connected actions to books and questions. |
| Philosophy (`InquiryPaths`) | Removed the fixed viewport height, stacked columns on smaller screens, improved paragraph spacing, and linked the explanatory action to the verse apparatus. |
| Book collection and cards | Added responsive columns, corrected heading levels, removed overlapping absolute-positioned footers, and gave Explore links distinct accessible names. |
| Featured verse | Preserved the existing tabs and supplied text. Added a section target and reduced-motion support. Read/save controls are marked unavailable until implemented. |
| Living Inquiry | Added responsive columns and meaningful headings. Removed placeholder `#` links; the Inquiry action targets its existing book card. Question-page controls are unavailable until implemented. |
| Paths of Inquiry | Added responsive cards and headings, calculated book counts from each path's data, and marked unimplemented path-reading controls unavailable. |
| Dialogue | Retained the data-driven cards and destinations; improved section semantics, reading spacing, action sizing, and reduced-motion support. |
| Unmatched routes | Added a visible unavailable-page message and Return home link instead of a blank content area. |

Small bronze text now uses `bronze-ink` (`#795A32`), keeping the original bronze for larger accents. On the solid ivory and parchment backgrounds, the darker text measures approximately 5.57:1 and 5.06:1 contrast; the original bronze measured 3.40:1 and 3.08:1. This is a token-level check, not a full rendered-page contrast assessment.

Existing data files and the text of the supplied cards were preserved.

## Verification

- `npm run lint`
- `npm run build`
- `node scripts/check-home-ui.mjs`

The render checks cover the main landmark, page heading, unique IDs, fragment destinations, ARIA references, card collections, path counts, dialogue destinations, and recovery pages for unavailable URLs.

The in-app browser was unavailable. Viewport appearance, actual focus movement, tab interactions, zoom/reflow, and screen-reader output were not verified in a browser.

## Remaining work before release

- Implement book/chapter reading, question and path pages, discussions, and reading circles. Their page files are currently empty; the fallback is a recovery path, not a replacement for those features.
- Implement search, sign-in, and saved verses before enabling their controls.
- The community status and card labels come from static content; they are not connected to a live reading session or discussion service.
- Optimize the horizontal logo asset: the current PNG is approximately 755 KB despite being displayed at 150 CSS pixels wide. Measure page performance after asset optimization.
- Verify the page at 320, 375, 768, 1024, and 1440 CSS pixels, including short landscape viewports and browser zoom. Check for horizontal scrolling and clipped or overlapping text.
- Use only the keyboard to test the skip link, mobile menu (Enter/Space, Escape, and selecting a section), all links, and FeaturedVerse tabs (Left/Right, Home/End). Confirm that reduced-motion settings suppress press transforms.
