import { Link, Outlet } from "@tanstack/react-router";
import {
	CirclePlus,
	LayoutDashboard,
	PlugZap,
	ScanSearch,
	UserRound,
} from "lucide-react";
import { createContext, useContext, useState } from "react";

import { Logo } from "./brand";

const SearchContext = createContext("");

const navItems = [
	{ icon: LayoutDashboard, label: "Dashboard", to: "/app" },
	{ icon: CirclePlus, label: "New scan", to: "/app/new" },
	{ icon: ScanSearch, label: "Scans", to: "/app/roasts" },
	{ icon: PlugZap, label: "Integrations", to: "/app/integrations" },
	{ icon: UserRound, label: "Profile", to: "/app/profile" },
] as const;

export function useAppSearch() {
	return useContext(SearchContext);
}

export function AppShell({
	totalRoasts,
	user,
}: {
	totalRoasts: number;
	user: { email: string };
}) {
	const [search, setSearch] = useState("");
	const initial = user.email.slice(0, 1).toUpperCase() || "R";

	return (
		<SearchContext.Provider value={search}>
			<div className="app-shell">
				<aside className="app-sidebar">
					<Link aria-label="Flint home" className="app-sidebar__brand" to="/">
						<Logo />
					</Link>
					<nav aria-label="App navigation" className="app-sidebar__nav">
						{navItems.map((item) => (
							<Link
								activeOptions={{ exact: item.to === "/app" }}
								activeProps={{ className: "is-active" }}
								key={item.to}
								to={item.to}
							>
								<span className="app-sidebar__nav-label">
									<item.icon aria-hidden="true" size={16} strokeWidth={1.8} />
									{item.label}
								</span>
								{item.to === "/app/roasts" ? (
									<span className="nav-count">{totalRoasts}</span>
								) : null}
							</Link>
						))}
					</nav>
					<div className="app-sidebar__footer">
						<div className="ingest-status">
							<span>Ingest</span>
							<span className="status-pill">Idle</span>
						</div>
					</div>
				</aside>
				<div className="app-column">
					<header className="app-topbar">
						<label className="search-field">
							<span className="sr-only">Search scans by title</span>
							<input
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search scans"
								type="search"
								value={search}
							/>
						</label>
						<Link aria-label="Profile" className="avatar" to="/app/profile">
							{initial}
						</Link>
					</header>
					<main className="app-content">
						<Outlet />
					</main>
				</div>
			</div>
		</SearchContext.Provider>
	);
}

export function AppPage({ title }: { title: string }) {
	return (
		<div className="app-page">
			<header className="app-page__header">
				<h1>{title}</h1>
			</header>
			<section
				aria-label={`${title} content`}
				className="app-page__placeholder"
			/>
		</div>
	);
}
