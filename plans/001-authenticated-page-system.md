# 001 — Unify authenticated page hierarchy

- **Status**: DONE
- **Commit**: cac315f
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 6 files, small shared component plus route substitutions

## Problem

Every authenticated route declares its own page header. Four use Tailwind's sans
heading while Profile uses the `.app-page__header h1` display face. That creates
different hierarchy, spacing, and action alignment between pages that share one
shell.

```tsx
/* src/routes/app.new.tsx:70-79 — current */
<main className="app-page">
	<p className="text-xs font-medium uppercase tracking-wider text-stone-400">
		Dashboard / New roast
	</p>
	<h1 className="mt-2 text-3xl font-semibold tracking-tight">
		Roast new traces
	</h1>
	<p className="mt-1 text-sm text-stone-500">...</p>
</main>
```

```tsx
/* src/routes/app.profile.tsx:16-21 — current */
<div className="app-page">
	<header className="app-page__header">
		<p>Roast0 / Profile</p>
		<h1>Profile</h1>
	</header>
</div>
```

The dashboard header additionally uses a non-wrapping row at
`src/routes/app.index.tsx:18-31`, so its primary action can crowd the title on
narrow screens.

## Target

Create `src/components/app-page-header.tsx` with these contracts:

```tsx
type AppPageHeaderProps = {
	action?: ReactNode;
	breadcrumb: string;
	description?: string;
	title: string;
};

export function AppPageHeader({ action, breadcrumb, description, title }: AppPageHeaderProps) {
	return (
		<header className="app-page__header">
			<p className="app-page__breadcrumb">{breadcrumb}</p>
			<div className="app-page__title-row">
				<div>
					<h1>{title}</h1>
					{description ? <p className="app-page__description">{description}</p> : null}
				</div>
				{action}
			</div>
		</header>
	);
}
```

Add these exact shared rules in `src/shells.css`:

```css
.app-page__header { margin-bottom: 28px; }
.app-page__breadcrumb {
	margin: 0 0 8px;
	color: var(--muted);
	font-family: var(--font-mono);
	font-size: 12px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}
.app-page__title-row {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 16px;
}
.app-page__title-row h1 {
	margin: 0;
	font-size: 30px;
	font-weight: 600;
	letter-spacing: -0.025em;
}
.app-page__description {
	margin: 4px 0 0;
	color: var(--muted);
	font-size: 14px;
}
@media (max-width: 760px) {
	.app-page__title-row { align-items: stretch; flex-direction: column; }
	.app-page__title-row > a,
	.app-page__title-row > button { width: 100%; justify-content: center; }
}
```

Replace the manually written headers in `src/routes/app.index.tsx`,
`src/routes/app.new.tsx`, `src/routes/app.roasts.index.tsx`,
`src/routes/app.roasts.$batch.tsx`, and `src/routes/app.profile.tsx`. Keep each
route's current copy, data loading, and content below its header unchanged.

## Repo conventions to follow

- Authenticated pages already use `.app-page` from `src/shells.css:387-389`.
- Existing page actions use a rounded orange button, e.g.
  `src/routes/app.index.tsx:25-30`; keep those colors and dimensions.
- `src/components/app-shell.tsx` is the shared authenticated layout; do not add
  route padding back into individual pages.

## Steps

1. Add `src/components/app-page-header.tsx` using the exact props and markup in
   Target. Import `ReactNode` as a type.
2. Add target CSS after `.app-page` in `src/shells.css`. Remove the current
   `.app-page__header h1` coupling from the auth heading selector so profile
   uses the new app heading, while `.auth-card__content h1` retains its display
   type.
3. Replace each route's breadcrumb, title, and description markup with
   `AppPageHeader`. Pass Dashboard's existing New roast anchor as `action`.
4. Keep Profile's account card narrow (`max-w-xl`); only its header becomes
   shared.
5. Add one route/component test proving Profile and New roast render their
   current title, description, and page action through the shared header.

## Boundaries

- Do NOT alter auth, data loading, roast processing, or copy.
- Do NOT add a UI library or animation dependency.
- Do NOT constrain `.app-page` width; it is intentionally full width.
- If current markup has changed since commit `cac315f`, stop and reconcile the
  affected route before editing.

## Verification

- **Mechanical**: `bun run check && bun test src/routes/-all-routes.test.tsx && bun run build` all pass.
- **Feel check**: at 1440px and 390px, compare Dashboard, New roast, Roasts,
  Batch, and Profile. Breadcrumbs, heading baselines, descriptions, and first
  content edge must align. On 390px, Dashboard's action sits below the title
  without horizontal overflow.
- **Done when**: every authenticated route uses `AppPageHeader`, no route owns
  duplicate header spacing, and all page content remains inside the shared
  shell gutter.
