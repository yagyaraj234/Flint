# 002 — Add crisp authenticated interaction states

- **Status**: DONE
- **Commit**: cac315f
- **Severity**: MEDIUM
- **Category**: Accessibility and cohesion
- **Estimated scope**: 4 files, CSS interaction states and responsive actions

## Problem

High-frequency authenticated controls have no hover or keyboard focus feedback.
The sidebar, avatar, and search input teleport between visual states. The upload
footer uses a fixed horizontal row, which can make the safety note and primary
action compete for width on a phone.

```css
/* src/shells.css:270-280 — current */
.app-sidebar__nav a {
	display: flex;
	min-height: 42px;
	align-items: center;
	justify-content: space-between;
	padding: 0 12px;
	border-radius: 10px;
	color: var(--muted);
	font-size: 14px;
	font-weight: 500;
}
```

```tsx
/* src/routes/app.new.tsx:156-167 — current */
<div className="mt-5 flex items-center justify-between gap-4">
	<p className="text-xs text-stone-500">Secrets are redacted before any row is stored.</p>
	<button className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-medium text-white">
		Roast traces
	</button>
</div>
```

The repository has the correct strong UI exit curve at `src/styles.css:15`:
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, but authenticated controls do not
use it. The only authenticated animation is the processing spinner at
`src/routes/app.roasts.$batch.tsx:138-141`; it should remain a constant,
purposeful status signal.

## Target

Add only color, shadow, border, and subtle press feedback to authenticated
controls. High-frequency sidebar navigation must not move on hover.

```css
/* src/shells.css — target additions */
.app-sidebar__nav a {
	transition: background 160ms ease, color 160ms ease;
}
.avatar {
	transition: transform 160ms var(--ease-out), box-shadow 160ms ease;
}
.search-field input {
	transition: border-color 160ms ease, box-shadow 160ms ease;
}
.app-sidebar__nav a:focus-visible,
.avatar:focus-visible,
.search-field input:focus-visible {
	outline: 2px solid var(--ember);
	outline-offset: 2px;
}
.avatar:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
	.app-sidebar__nav a:not(.is-active):hover { background: #f5f5f4; color: var(--text); }
	.avatar:hover { box-shadow: 0 0 0 3px rgba(255, 77, 0, 0.16); }
}
@media (prefers-reduced-motion: reduce) {
	.avatar:active { transform: none; }
}
```

Use this exact responsive upload footer target:

```tsx
<div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
	<p className="text-xs text-stone-500">Secrets are redacted before any row is stored.</p>
	<button className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-medium text-white sm:w-auto">
		...
	</button>
</div>
```

## Repo conventions to follow

- Reuse `--ease-out` from `src/styles.css:15`; do not introduce a second curve.
- `src/styles.css:122-143` shows the product's existing 160ms press-feedback
  convention. Keep new feedback under 160ms.
- The global reduced-motion block is at `src/styles.css:1756-1768`; the added
  local rule must preserve visible focus and color feedback while dropping only
  the avatar scale transform.

## Steps

1. Add the target sidebar, avatar, and search CSS to `src/shells.css`.
2. Add the target responsive upload-footer classes in `src/routes/app.new.tsx`.
3. Add the same responsive action treatment to Dashboard's New roast action in
   `src/routes/app.index.tsx` if it is not already covered by Plan 001's shared
   header action rule.
4. Do not change `animate-spin` in `src/routes/app.roasts.$batch.tsx`; it is a
   continuous progress indicator rather than decorative movement.
5. Add a test that keeps the Profile link keyboard-focusable and the upload
   action present when the upload tab is selected.

## Boundaries

- Do NOT use `transition: all`.
- Do NOT animate layout properties, including width, height, margin, padding,
  top, or left.
- Do NOT add hover movement to sidebar rows.
- Do NOT alter the global reduced-motion policy outside the local avatar rule.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `bun run check && bun test src/routes/-all-routes.test.tsx && bun run build` all pass.
- **Feel check**: hover sidebar rows repeatedly; only color/background changes,
  with no perceived travel. Click the top-right avatar repeatedly; press scales
  subtly and never restarts an animation. Tab through sidebar, search, and
  avatar; each has a visible 2px ember focus ring.
- Toggle `prefers-reduced-motion`; avatar press no longer scales, while focus
  and color state changes remain visible. At 390px, New roast's safety note and
  submit button stack without clipping or horizontal scroll.
- **Done when**: authenticated controls respond visibly to mouse and keyboard,
  high-frequency navigation remains spatially still, and the upload action is
  usable on narrow viewports.
