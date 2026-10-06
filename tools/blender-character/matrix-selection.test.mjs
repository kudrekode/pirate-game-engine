import assert from "node:assert/strict";
import test from "node:test";
import {
	matrixSelectionArgument,
	selectMatrixCases,
} from "./matrix-selection.mjs";
import { runProceduralMannequinHairstyleMatrix } from "./procedural-mannequin-hairstyle-matrix.mjs";
import { runProceduralMannequinTopologyMatrix } from "./procedural-mannequin-topology-matrix.mjs";

test("matrix selection rejects mistakes instead of silently launching a full matrix", () => {
	assert.throws(
		() => matrixSelectionArgument(["--case"], "--case"),
		/requires/,
	);
	assert.throws(
		() => matrixSelectionArgument(["--case", "--list"], "--case"),
		/requires/,
	);
	assert.throws(
		() => selectMatrixCases([["default", {}]], ["typo"]),
		/Unknown/,
	);
	assert.throws(() => selectMatrixCases([["default", {}]], []), /empty/);
	assert.deepEqual(
		matrixSelectionArgument(["--case", "default,maximum-height"], "--case"),
		["default", "maximum-height"],
	);
});
test("topology listing selects exact cases without compiling", async () => {
	const all = await runProceduralMannequinTopologyMatrix({ listOnly: true });
	assert.equal(all.artifactCount, 21);
	const selected = await runProceduralMannequinTopologyMatrix({
		listOnly: true,
		caseNames: ["default", "height-max"],
	});
	assert.deepEqual(selected, {
		caseNames: ["default", "height-max"],
		artifactCount: 2,
		blenderPasses: 4,
	});
	await assert.rejects(
		runProceduralMannequinTopologyMatrix({
			listOnly: true,
			caseNames: ["typo"],
		}),
		/Unknown/,
	);
});
test("targeted hair matrix preserves bald controls and reports its exact cost", async () => {
	const all = await runProceduralMannequinHairstyleMatrix({
		listOnly: true,
		library: true,
	});
	assert.equal(all.artifactCount, 36);
	const selected = await runProceduralMannequinHairstyleMatrix({
		listOnly: true,
		caseNames: ["default"],
		styleIds: ["quaternius-hair-long-v1"],
	});
	assert.deepEqual(selected, {
		caseNames: ["default"],
		componentIds: ["none", "quaternius-hair-long-v1"],
		artifactCount: 2,
		blenderPasses: 4,
	});
	await assert.rejects(
		runProceduralMannequinHairstyleMatrix({
			listOnly: true,
			styleIds: ["typo"],
		}),
		/Unknown/,
	);
});
