import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync(new URL("./app.new.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function contrast(hex: string): number {
	const channels = [1, 3, 5].map(
		(index) => parseInt(hex.slice(index, index + 2), 16) / 255,
	);
	const luminance = channels
		.map((value) =>
			value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
		)
		.reduce(
			(total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index],
			0,
		);
	return 1.05 / (luminance + 0.05);
}

test("trace input tabs keep keyboard and panel semantics", () => {
	expect(source).toContain("aria-controls={`trace-panel-" + "$" + "{name}`}");
	expect(source).toContain("onKeyDown={selectFromKeyboard}");
	expect(source).toContain('id="trace-panel-paste"');
	expect(source).toContain('id="trace-panel-upload"');
});

test("shared text tokens meet AA contrast on white", () => {
	for (const name of [
		"muted",
		"accent",
		"tier-rare",
		"tier-medium",
		"tier-welldone",
	]) {
		const color = styles.match(
			new RegExp(`--color-${name}: (#[0-9a-f]{6})`),
		)?.[1];
		expect(color).toBeTruthy();
		expect(contrast(color as string)).toBeGreaterThanOrEqual(4.5);
	}
});
