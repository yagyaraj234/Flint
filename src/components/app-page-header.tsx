import type { ReactNode } from "react";

type AppPageHeaderProps = {
	action?: ReactNode;
	breadcrumb: string;
	description?: string;
	title: string;
};

export function AppPageHeader({
	action,
	breadcrumb,
	description,
	title,
}: AppPageHeaderProps) {
	return (
		<header className="app-page__header">
			<p className="app-page__breadcrumb">{breadcrumb}</p>
			<div className="app-page__title-row">
				<div>
					<h1>{title}</h1>
					{description ? (
						<p className="app-page__description">{description}</p>
					) : null}
				</div>
				{action}
			</div>
		</header>
	);
}
