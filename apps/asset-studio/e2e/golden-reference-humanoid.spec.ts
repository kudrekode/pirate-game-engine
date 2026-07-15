import { writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";

type JointTransform = { position: number[]; rotation: number[] };
type JointDiagnostics = Record<string, JointTransform>;
type QualitySummary = {
	finiteTransforms: boolean;
	maxBoneLengthRelativeError: number;
	maxBoundingSpanRelativeToRestHeight: number;
	maxClavicleRestRotationDegrees: number;
	maxIdleSymmetryError: number;
	maxRootHorizontalDisplacement: number;
	passed: boolean;
};

const CAMERA_PRESETS = ["Front", "Side", "Three-quarter"] as const;
const SAMPLE_TIMES = [0, 0.25, 0.5, 0.75] as const;
const JOINT_NAMES = [
	"pelvis",
	"spine_03",
	"neck_01",
	"Head",
	"clavicle_l",
	"clavicle_r",
	"upperarm_l",
	"upperarm_r",
	"lowerarm_l",
	"lowerarm_r",
	"hand_l",
	"hand_r",
	"thigh_l",
	"thigh_r",
	"calf_l",
	"calf_r",
	"foot_l",
	"foot_r",
] as const;

function distance(joints: JointDiagnostics, left: string, right: string) {
	return Math.hypot(
		...joints[left].position.map(
			(value, index) => value - joints[right].position[index],
		),
	);
}

async function waitForPreview(page: Page, host: Locator) {
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle");
	await expect(host).toHaveAttribute("data-joint-diagnostics", /pelvis/);
}

async function captureCanvas(page: Page, canvas: Locator, path: string) {
	const overlays = page.locator(
		".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
	);
	await overlays.evaluateAll((elements) => {
		for (const element of elements)
			(element as HTMLElement).style.visibility = "hidden";
	});
	await canvas.screenshot({ path });
	await overlays.evaluateAll((elements) => {
		for (const element of elements)
			(element as HTMLElement).style.visibility = "";
	});
}

test("visually validates deterministic Golden Reference rest-frame retargeting", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	const consoleErrors: string[] = [];
	const bindingErrors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
		if (
			message.type() === "error" &&
			/track|bind|skeleton|webgl/i.test(message.text())
		)
			bindingErrors.push(message.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));

	const host = page.locator(
		'[data-preview-source="golden-reference-humanoid-v0"]',
	);
	const canvas = page.locator(
		'canvas[aria-label="Golden Reference Humanoid preview"]',
	);
	const diagnosticsLog: Array<Record<string, unknown>> = [];

	// Preserve a deterministic visual record of the rejected v1 result.
	await page.goto("/?retarget=failed-v1");
	await waitForPreview(page, host);
	await expect(host).toHaveAttribute("data-retarget-mode", "failed-v1");
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	const failedQuality = JSON.parse(
		(await host.getAttribute("data-idle-quality")) ?? "{}",
	) as QualitySummary;
	expect(failedQuality.passed).toBe(false);
	expect(failedQuality.maxClavicleRestRotationDegrees).toBeGreaterThan(160);
	for (const preset of CAMERA_PRESETS) {
		await page.getByRole("button", { name: preset, exact: true }).click();
		await expect(host).toHaveAttribute(
			"data-camera-preset",
			preset.toLowerCase(),
		);
		const screenshot = `before-failed-v1-idle-00-${preset.toLowerCase()}.png`;
		await captureCanvas(page, canvas, testInfo.outputPath(screenshot));
		diagnosticsLog.push({
			camera: preset,
			joints: JSON.parse(
				(await host.getAttribute("data-joint-diagnostics")) ?? "{}",
			),
			quality: failedQuality,
			screenshot,
			state: "failed-v1-idle",
			time: 0,
		});
	}

	await page.goto("/");
	await waitForPreview(page, host);
	await expect(host).toHaveAttribute("data-retarget-mode", "corrected-v2");
	await expect(host).toHaveAttribute(
		"data-retarget-profile",
		"mixamo-quaternius-rest-delta-v2",
	);
	const diagnostics = page.getByLabel("Golden Reference Humanoid diagnostics");
	await expect(diagnostics).toContainText("Animation clips2");
	await expect(diagnostics).toContainText("22 mapped");
	await expect(diagnostics).toContainText("rest-delta-v2");
	await expect(diagnostics).toContainText("visual inspection still required");
	const idleQuality = JSON.parse(
		(await host.getAttribute("data-idle-quality")) ?? "{}",
	) as QualitySummary;
	const walkQuality = JSON.parse(
		(await host.getAttribute("data-walk-quality")) ?? "{}",
	) as QualitySummary;
	for (const quality of [idleQuality, walkQuality]) {
		expect(quality.passed).toBe(true);
		expect(quality.finiteTransforms).toBe(true);
		expect(quality.maxBoneLengthRelativeError).toBeLessThan(0.00001);
		expect(quality.maxClavicleRestRotationDegrees).toBeLessThan(45);
		expect(quality.maxRootHorizontalDisplacement).toBeLessThan(0.00001);
	}
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await expect(host).toHaveAttribute("data-animation-playing", "false");

	const recordPose = async (
		state: "idle" | "rest" | "walk",
		time: number,
		preset: (typeof CAMERA_PRESETS)[number],
	) => {
		await page.getByRole("button", { name: preset, exact: true }).click();
		await expect(host).toHaveAttribute(
			"data-camera-preset",
			preset.toLowerCase(),
		);
		const joints = JSON.parse(
			(await host.getAttribute("data-joint-diagnostics")) ?? "{}",
		) as JointDiagnostics;
		for (const name of JOINT_NAMES) {
			expect(joints[name]).toBeTruthy();
			expect(
				[...joints[name].position, ...joints[name].rotation].every(
					Number.isFinite,
				),
			).toBe(true);
		}
		const screenshot = `after-v2-${state}-${String(Math.round(time * 100)).padStart(2, "0")}-${preset.toLowerCase()}.png`;
		await captureCanvas(page, canvas, testInfo.outputPath(screenshot));
		diagnosticsLog.push({
			boundsExpansion: await host.getAttribute("data-bounds-expansion"),
			boundsOverallExpansion: await host.getAttribute(
				"data-bounds-overall-expansion",
			),
			camera: preset,
			joints,
			quality:
				state === "idle"
					? idleQuality
					: state === "walk"
						? walkQuality
						: undefined,
			screenshot,
			state,
			time,
		});
		await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
		return joints;
	};

	await page.getByRole("button", { name: "Rest", exact: true }).click();
	const restPose = await host.getAttribute("data-pose-snapshot");
	let restJoints: JointDiagnostics | undefined;
	for (const preset of CAMERA_PRESETS) {
		const joints = await recordPose("rest", 0, preset);
		restJoints ??= joints;
	}
	if (!restJoints) throw new Error("Rest diagnostics were not captured.");

	for (const state of ["idle", "walk"] as const) {
		await page
			.getByRole("button", {
				name: state[0].toUpperCase() + state.slice(1),
				exact: true,
			})
			.click();
		await expect(host).toHaveAttribute("data-animation-state", state);
		for (const time of SAMPLE_TIMES) {
			await page.getByLabel("Animation sample time").fill(String(time));
			await expect(
				page.getByText(`Sample ${Math.round(time * 100)}%`),
			).toBeVisible();
			for (const preset of CAMERA_PRESETS) {
				const joints = await recordPose(state, time, preset);
				for (const [parent, child] of [
					["clavicle_l", "upperarm_l"],
					["upperarm_l", "lowerarm_l"],
					["lowerarm_l", "hand_l"],
					["clavicle_r", "upperarm_r"],
					["upperarm_r", "lowerarm_r"],
					["lowerarm_r", "hand_r"],
					["thigh_l", "calf_l"],
					["calf_l", "foot_l"],
					["thigh_r", "calf_r"],
					["calf_r", "foot_r"],
				] as const) {
					const ratio =
						distance(joints, parent, child) /
						distance(restJoints, parent, child);
					expect(Math.abs(ratio - 1)).toBeLessThan(0.001);
				}
				expect(
					joints.clavicle_l.position[1] - joints.neck_01.position[1],
				).toBeLessThan(0.03);
				expect(
					joints.clavicle_r.position[1] - joints.neck_01.position[1],
				).toBeLessThan(0.03);
				expect(distance(joints, "clavicle_l", "hand_l")).toBeGreaterThan(0.3);
				expect(distance(joints, "clavicle_r", "hand_r")).toBeGreaterThan(0.3);
			}
		}
	}

	await page.getByRole("button", { name: "Rest", exact: true }).click();
	expect(await host.getAttribute("data-pose-snapshot")).toBe(restPose);
	const initialCamera = await host.getAttribute("data-camera-position");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("Preview canvas is not measurable.");
	await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, {
		steps: 8,
	});
	await page.mouse.up();
	await expect(host).not.toHaveAttribute(
		"data-camera-position",
		initialCamera ?? "",
	);
	await page.getByRole("button", { name: "Reset view", exact: true }).click();
	await expect(host).toHaveAttribute("data-camera-preset", "three-quarter");

	await writeFile(
		testInfo.outputPath("retarget-pose-diagnostics.json"),
		`${JSON.stringify(diagnosticsLog, null, 2)}\n`,
	);
	expect(consoleErrors).toEqual([]);
	expect(bindingErrors).toEqual([]);
});
