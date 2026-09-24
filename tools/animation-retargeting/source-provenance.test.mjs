import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
	GOLDEN_REFERENCE_SOURCE_PROVENANCE,
	validateSourceProvenance,
} from "./source-provenance.mjs";

test("validates the canonical Mixamo source layout and project provenance", async () => {
	const report = await validateSourceProvenance();
	assert.equal(report.passed, true);
	assert.deepEqual(
		report.results.map(({ clipId, sourceHash }) => ({ clipId, sourceHash })),
		GOLDEN_REFERENCE_SOURCE_PROVENANCE.map(({ clipId, expectedHash }) => ({
			clipId,
			sourceHash: expectedHash,
		})),
	);
	await assert.rejects(
		access("public/assets/source/humanoid-animations/retarget-spike/Idle.fbx"),
	);
	await assert.rejects(
		access(
			"public/assets/source/humanoid-animations/retarget-spike/Walking.fbx",
		),
	);
});

test("rejects unknown providers and source hash mismatches", async () => {
	const source = GOLDEN_REFERENCE_SOURCE_PROVENANCE[0];
	const report = await validateSourceProvenance([
		{ ...source, expectedHash: "0".repeat(64), provider: "Unknown Provider" },
	]);
	assert.equal(report.passed, false);
	assert.deepEqual(report.results[0].issues.map((issue) => issue.code).sort(), [
		"incomplete_license_metadata",
		"invalid_source_metadata",
		"source_hash_mismatch",
		"unknown_provider",
	]);
});

test("rejects missing vendor binaries", async () => {
	const source = GOLDEN_REFERENCE_SOURCE_PROVENANCE[0];
	const report = await validateSourceProvenance([
		{ ...source, sourcePath: `${source.sourcePath}.missing` },
	]);
	assert.equal(report.passed, false);
	assert.equal(report.results[0].issues[0].code, "missing_file");
});

test("rejects non-FBX content presented as a vendor source", async () => {
	const source = GOLDEN_REFERENCE_SOURCE_PROVENANCE[0];
	const fakeSource = await readFile(source.sourceDocumentPath);
	const report = await validateSourceProvenance([
		{
			...source,
			expectedHash: createHash("sha256").update(fakeSource).digest("hex"),
			sourcePath: source.sourceDocumentPath,
		},
	]);
	assert.equal(report.passed, false);
	assert.equal(
		report.results[0].issues.some(
			(issue) => issue.code === "invalid_vendor_source",
		),
		true,
	);
});
