import { expect, test } from "vitest";
import { getGameImportContext } from "./UseInGame";

test("requires a live, explicit local project context and refuses remote destinations", () => {
	const url =
		"http://localhost:5174/?gameContext=token&returnTo=http%3A%2F%2Flocalhost%3A5173%2F";
	expect(getGameImportContext(url, true)).toEqual({
		token: "token",
		origin: "http://localhost:5173",
	});
	expect(getGameImportContext(url, false)).toBeUndefined();
	expect(getGameImportContext("http://localhost:5174", true)).toBeUndefined();
	expect(
		getGameImportContext(url.replace("localhost%3A5173", "example.com"), true),
	).toBeUndefined();
});
