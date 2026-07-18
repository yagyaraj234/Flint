import { Check, Copy, Image, Share2 } from "lucide-react";
import { useState } from "react";

import {
	fallbackRoastLine,
	formatShareText,
	type PublicRoast,
} from "../lib/public-roasts";

const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

function wrapText(
	context: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
): string[] {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (line && context.measureText(next).width > maxWidth) {
			lines.push(line);
			line = word;
		} else line = next;
	}
	if (line) lines.push(line);
	return lines;
}

async function copyRoastImage(roast: PublicRoast): Promise<void> {
	if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
		throw new Error("Image clipboard unavailable");
	}

	const canvas = document.createElement("canvas");
	canvas.width = SHARE_IMAGE_SIZE.width;
	canvas.height = SHARE_IMAGE_SIZE.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas unavailable");

	context.fillStyle = "#fffaf3";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.strokeStyle = "#e9ded2";
	context.lineWidth = 1;
	for (let x = 0; x <= canvas.width; x += 60) {
		context.beginPath();
		context.moveTo(x, 0);
		context.lineTo(x, canvas.height);
		context.stroke();
	}
	for (let y = 0; y <= canvas.height; y += 60) {
		context.beginPath();
		context.moveTo(0, y);
		context.lineTo(canvas.width, y);
		context.stroke();
	}

	context.fillStyle = "#ff5d1f";
	context.fillRect(70, 72, 10, 10);
	context.fillStyle = "#2a241f";
	context.font = "600 22px sans-serif";
	context.fillText("FLINT / TRACE REPORT", 98, 82);
	context.fillStyle = "#7a6c62";
	context.font = "500 18px monospace";
	context.fillText(
		`${roast.source.toUpperCase()} · ${roast.tier.toUpperCase()}`,
		70,
		138,
	);

	context.fillStyle = "#2a241f";
	context.font = "500 64px Georgia, serif";
	const titleLines = wrapText(context, roast.title, 700).slice(0, 2);
	titleLines.forEach((line, index) => {
		context.fillText(line, 70, 220 + index * 70);
	});
	context.fillStyle = "#c84b16";
	context.font = "italic 42px Georgia, serif";
	const verdictLines = wrapText(
		context,
		roast.roastLine ?? fallbackRoastLine(roast.tier),
		720,
	).slice(0, 2);
	verdictLines.forEach((line, index) => {
		context.fillText(`“${line}”`, 70, 390 + index * 48);
	});

	context.fillStyle = "#2a241f";
	context.fillRect(876, 72, 254, 254);
	context.fillStyle = "#fffaf3";
	context.font = "500 118px monospace";
	context.fillText(String(roast.score), 912, 196);
	context.font = "500 18px monospace";
	context.fillText("HEALTH SCORE / 100", 912, 248);
	context.fillStyle = "#ffe1d3";
	context.font = "600 26px monospace";
	context.fillText(`${money(roast.cost.wasteUsd)} WASTE / RUN`, 912, 292);

	context.fillStyle = "#2a241f";
	context.font = "600 20px monospace";
	context.fillText("FIX FIRST", 70, 552);
	context.font = "500 22px sans-serif";
	const firstFinding = roast.findings[0];
	const fix = firstFinding
		? `Fix ${firstFinding.rule.replaceAll("-", " ")}: ${firstFinding.message}`
		: "No material finding in this trace.";
	wrapText(context, fix, 960)
		.slice(0, 2)
		.forEach((line, index) => {
			context.fillText(line, 205, 552 + index * 28);
		});

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((value) => {
			if (value) resolve(value);
			else reject(new Error("Could not create share image"));
		}, "image/png");
	});
	await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function money(value: number): string {
	return `$${value.toFixed(value < 10 ? 2 : 0)}`;
}

export function ShareButtons({ roast }: { roast: PublicRoast }) {
	const [copyState, setCopyState] = useState<
		"idle" | "copied" | "imageCopied" | "failed"
	>("idle");

	async function copyRoast(): Promise<void> {
		try {
			await navigator.clipboard.writeText(
				formatShareText(roast, window.location.href),
			);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
	}

	async function copyImage(): Promise<void> {
		try {
			await copyRoastImage(roast);
			setCopyState("imageCopied");
		} catch {
			setCopyState("failed");
		}
	}

	async function shareRoast(): Promise<void> {
		if (!navigator.share) return copyRoast();
		try {
			await navigator.share({
				title: `${roast.score}/100 · ${roast.tier} · Flint`,
				text: roast.roastLine ?? fallbackRoastLine(roast.tier),
				url: window.location.href,
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			setCopyState("failed");
		}
	}

	return (
		<div className="share-actions">
			<button type="button" onClick={copyRoast}>
				{copyState === "copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
				{copyState === "copied" ? "Copied" : "Copy roast"}
			</button>
			<button type="button" onClick={copyImage}>
				{copyState === "imageCopied" ? (
					<Check aria-hidden="true" />
				) : (
					<Image aria-hidden="true" />
				)}
				{copyState === "imageCopied" ? "Image copied" : "Copy image"}
			</button>
			<button type="button" onClick={shareRoast}>
				<Share2 aria-hidden="true" /> Share
			</button>
			<span aria-live="polite">
				{copyState === "failed" ? "Could not copy. Copy the URL instead." : ""}
			</span>
		</div>
	);
}
