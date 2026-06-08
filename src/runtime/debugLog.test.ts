import { describe, expect, it } from "vitest";
import { appendRuntimeDebugEvent } from "./debugLog";

describe("runtime debug log", () => {
	it("appends discrete events and caps old entries", () => {
		let events = appendRuntimeDebugEvent([], "Game started.", 1, 2);
		events = appendRuntimeDebugEvent(events, "Rule fired.", 2, 2);
		events = appendRuntimeDebugEvent(events, "Quest completed.", 3, 2);

		expect(events).toEqual([
			{ id: 2, message: "Rule fired." },
			{ id: 3, message: "Quest completed." },
		]);
	});
});
