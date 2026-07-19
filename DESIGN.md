# Helix design system

The implemented UI is editorial, light, and compact: ink content, hairline
borders, one blue accent, and dense report information. Tokens live in
`src/styles.css`; shared class compositions live in `src/components/ui.ts`.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#0a0a0a` | Primary text and filled controls |
| `muted` | `#7a7a7a` | Supporting text |
| `accent` | `#4a7fd6` | Links, focus, active navigation, score details |
| `accent-soft` | `#e4eafc` | Active/secondary accent surfaces |
| `line` | `#e5e5e5` | Borders and grids |
| `surface-alt` | `#f4f4f5` | Hover and alternate surfaces |
| `paper` | `#fafaf9` | App/report background |
| `danger` | `#dc2626` | Errors and invalid connection state |

Type is General Sans for app UI, Inter for the landing page, Instrument Serif
for the italic `helix` wordmark, and JetBrains Mono for labels, metrics, and
code-like values.

## Components and layout

- Landing page: centered cost-first hero, bordered product preview, two-column
  findings grid, and image footer. Its primary action is **Analyze a trace**.
- App shell: sticky desktop sidebar, sticky search/header row, responsive
  horizontal mobile navigation, and white cards over `paper`.
- Reports: score/tier lead, categorized findings and remediation follow, then
  cost cells and a collapsed redacted trace timeline. Sharing controls are
  hidden from print.
- Controls: primary actions are ink pills; secondary actions are white pills
  with `line` borders; fields use a blue focus ring.

Use the existing `primaryButton`, `secondaryButton`, `fieldClass`, `monoLabel`,
and `accentLink` compositions before creating new variants.

## Motion and accessibility

Entrance/score/dialog motion is short and opacity/transform based. Global
reduced-motion handling disables animation and smooth scrolling. Focus-visible
uses the accent outline; form controls retain semantic labels and report
sections use headings/landmarks.
