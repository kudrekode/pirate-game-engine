// Narrow selection shared by the expensive matrix entry points. No compiler work here.
export function selectMatrixCases(cases, names, label = "case") {
	if (names === undefined) return cases;
	if (
		!names.length ||
		names.some((name) => !cases.some(([id]) => id === name))
	) {
		throw new Error(
			`Unknown or empty ${label} selection. Available: ${cases.map(([id]) => id).join(", ")}`,
		);
	}
	return cases.filter(([id]) => names.includes(id));
}

export function matrixSelectionArgument(argv, flag) {
	const index = argv.indexOf(flag);
	if (index < 0) return undefined;
	const value = argv[index + 1];
	if (!value || value.startsWith("--"))
		throw new Error(`${flag} requires comma-separated exact names.`);
	return value.split(",");
}
