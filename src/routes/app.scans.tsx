import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/scans")({ component: Outlet });
