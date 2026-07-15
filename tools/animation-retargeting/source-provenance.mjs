import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const KNOWN_PROVIDERS = new Set(["Adobe Mixamo"]);
const SOURCE_ROOT = "public/assets/source/humanoid-animations/retarget-spike";

export const GOLDEN_REFERENCE_SOURCE_PROVENANCE = Object.freeze([
	Object.freeze({
		animation: "Idle",
		clipId: "idle",
		expectedHash:
			"42f1b0d7b82337ded5d93412afdd2fff8a04727393a086afc4432a2c8ed102a0",
		licensePath: `${SOURCE_ROOT}/idle/LICENSE.txt`,
		originalFilename: "Idle.fbx",
		provider: "Adobe Mixamo",
		sourceDocumentPath: `${SOURCE_ROOT}/idle/SOURCE.md`,
		sourcePath: `${SOURCE_ROOT}/idle/source.fbx`,
	}),
	Object.freeze({
		animation: "Walking",
		clipId: "walk",
		expectedHash:
			"17c86280998e4a948b37485d08a156b36798a82d22a3f3a34fa0de774926d56e",
		licensePath: `${SOURCE_ROOT}/walk/LICENSE.txt`,
		originalFilename: "Walking.fbx",
		provider: "Adobe Mixamo",
		sourceDocumentPath: `${SOURCE_ROOT}/walk/SOURCE.md`,
		sourcePath: `${SOURCE_ROOT}/walk/source.fbx`,
	}),
]);

const sha256 = (input) => createHash("sha256").update(input).digest("hex");

function field(markdown, name) {
	return new RegExp(`^${name}:\\s*(.+)$`, "imu").exec(markdown)?.[1].trim();
}

async function readRequired(path, issues, label) {
	try {
		return await readFile(path);
	} catch {
		issues.push({
			code: "missing_file",
			message: `${label} is missing: ${path}`,
			path,
		});
		return undefined;
	}
}

export async function validateSourceProvenance(
	records = GOLDEN_REFERENCE_SOURCE_PROVENANCE,
) {
	const results = [];
	for (const record of records) {
		const issues = [];
		if (!KNOWN_PROVIDERS.has(record.provider)) {
			issues.push({
				code: "unknown_provider",
				message: `Provider is not approved: ${record.provider}`,
			});
		}
		const [source, sourceDocumentBuffer, licenseBuffer] = await Promise.all([
			readRequired(record.sourcePath, issues, "Vendor source"),
			readRequired(record.sourceDocumentPath, issues, "SOURCE.md"),
			readRequired(record.licensePath, issues, "LICENSE.txt"),
		]);
		const sourceHash = source ? sha256(source) : undefined;
		if (
			source &&
			!source.subarray(0, 18).toString("ascii").startsWith("Kaydara FBX Binary")
		) {
			issues.push({
				code: "invalid_vendor_source",
				message: `${record.sourcePath} is not an FBX Binary vendor source.`,
			});
		}
		if (sourceHash && sourceHash !== record.expectedHash) {
			issues.push({
				actual: sourceHash,
				code: "source_hash_mismatch",
				expected: record.expectedHash,
				message: `Vendor source hash changed: ${record.sourcePath}`,
			});
		}
		if (sourceDocumentBuffer) {
			const document = sourceDocumentBuffer.toString("utf8");
			const requiredFields = {
				Animation: record.animation,
				Downloaded: "2026-07-15",
				Provider: record.provider,
			};
			for (const [name, expected] of Object.entries(requiredFields)) {
				const actual = field(document, name);
				if (actual !== expected) {
					issues.push({
						actual,
						code: "invalid_source_metadata",
						expected,
						field: name,
						message: `${record.sourceDocumentPath} has invalid ${name}.`,
					});
				}
			}
			for (const requiredText of [
				record.originalFilename,
				"Format: FBX Binary",
				"Skin: With Skin",
				"FPS: 30",
				"The original vendor FBX is preserved unchanged.",
				"This project-maintained provenance record was not supplied by Adobe.",
			]) {
				if (!document.includes(requiredText)) {
					issues.push({
						code: "incomplete_source_metadata",
						message: `${record.sourceDocumentPath} is missing: ${requiredText}`,
					});
				}
			}
		}
		if (licenseBuffer) {
			const license = licenseBuffer.toString("utf8");
			for (const requiredText of [
				record.provider,
				"https://www.mixamo.com/",
				"Usage is governed by Adobe Mixamo's current licence terms.",
				"This project-maintained provenance record was not supplied by Adobe.",
			]) {
				if (!license.includes(requiredText)) {
					issues.push({
						code: "incomplete_license_metadata",
						message: `${record.licensePath} is missing: ${requiredText}`,
					});
				}
			}
		}
		results.push({
			...record,
			issues,
			passed: issues.length === 0,
			sourceHash,
		});
	}
	return {
		passed: results.every((result) => result.passed),
		profile: "golden-reference-mixamo-source-v1",
		results,
	};
}

export async function assertSourceProvenance(records) {
	const report = await validateSourceProvenance(records);
	if (!report.passed) {
		throw new Error(
			`Source provenance validation failed:\n${report.results
				.flatMap((result) => result.issues.map((issue) => `- ${issue.message}`))
				.join("\n")}`,
		);
	}
	return report;
}
