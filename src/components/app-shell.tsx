import { Link, Outlet } from "@tanstack/react-router";
import {
	CirclePlus,
	CreditCard,
	LayoutDashboard,
	PlugZap,
	ScanSearch,
	UserRound,
} from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";

import { getBillingStatus } from "#/lib/billing.functions";
import { Logo } from "./brand";

const SearchContext = createContext("");

const navItems = [
	{ icon: LayoutDashboard, label: "Dashboard", to: "/app" },
	{ icon: CirclePlus, label: "New scan", to: "/app/new" },
	{ icon: ScanSearch, label: "Scans", to: "/app/roasts" },
	{ icon: PlugZap, label: "Integrations", to: "/app/integrations" },
	{ icon: CreditCard, label: "Billing", to: "/app/billing" },
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
	const [plan, setPlan] = useState<"free" | "pro" | null>(null);
	const initial = user.email.slice(0, 1).toUpperCase() || "R";
	useEffect(() => {
		void getBillingStatus()
			.then((billing) => setPlan(billing.plan))
			.catch(() => undefined);
	}, []);

	return (
		<SearchContext.Provider value={search}>
			<div className="min-h-svh bg-paper md:grid md:grid-cols-[232px_minmax(0,1fr)]">
				<aside className="border-b border-line bg-white px-4 py-3.5 md:sticky md:top-0 md:flex md:h-svh md:flex-col md:border-b-0 md:border-r md:px-4 md:py-6">
					<Link
						aria-label="Helix home"
						className="hidden w-max px-2 pb-7 md:block"
						to="/"
					>
						<Logo />
					</Link>
					<nav
						aria-label="App navigation"
						className="flex gap-1 overflow-x-auto md:grid md:gap-1"
					>
						{navItems.map((item) => (
							<Link
								activeOptions={{ exact: item.to === "/app" }}
								activeProps={{ className: "bg-accent-soft text-accent" }}
								className="flex min-h-10 flex-none items-center justify-between gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150"
								inactiveProps={{
									className: "text-muted hover:bg-surface-alt hover:text-ink",
								}}
								key={item.to}
								to={item.to as never}
							>
								<span className="inline-flex items-center gap-2.5">
									<item.icon aria-hidden="true" size={16} strokeWidth={1.8} />
									{item.label}
								</span>
								{item.to === "/app/roasts" ? (
									<span className="hidden h-5.5 min-w-5.5 place-items-center rounded-full bg-surface-alt px-1.5 font-mono text-[11px] text-muted md:grid">
										{totalRoasts}
									</span>
								) : null}
								{item.to === "/app/billing" && plan ? (
									<span className="hidden rounded-full bg-surface-alt px-2 py-0.5 font-mono text-[10px] uppercase text-muted md:block">
										{plan === "pro" ? "Pro" : "Free"}
									</span>
								) : null}
							</Link>
						))}
					</nav>
				</aside>
				<div className="min-w-0">
					<header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-6 border-b border-line bg-white/90 px-4 backdrop-blur md:px-8">
						<label className="w-full max-w-[420px]">
							<span className="sr-only">Search scans by title</span>
							<input
								className="h-10 w-full rounded-lg border border-line bg-paper px-3.5 text-sm text-ink outline-none transition duration-150 placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10"
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search scans"
								type="search"
								value={search}
							/>
						</label>
						<Link
							aria-label="Profile"
							className="grid size-8 flex-none place-items-center rounded-full bg-ink font-mono text-xs text-white transition duration-150 ease-out hover:ring-4 hover:ring-accent-soft active:scale-[0.97]"
							to="/app/profile"
						>
							{initial}
						</Link>
					</header>
					<main className="px-4 py-8 md:px-8 md:py-9">
						<Outlet />
					</main>
				</div>
			</div>
		</SearchContext.Provider>
	);
}
