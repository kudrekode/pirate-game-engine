import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
	cinematicAudioMaxBytes,
	isEmbeddedCinematicAudio,
	readCinematicAudioFile,
} from "../data/cinematicAudioImport";
import {
	AudioCueCreator,
	CinematicAudioSourceFields,
} from "../editor/cinematics/CinematicAudioFields";

const wav = "UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";

function wavFile(name: string, type: string) {
	return new File(
		[Uint8Array.from(atob(wav), (byte) => byte.charCodeAt(0))],
		name,
		{ type },
	);
}

it("accepts only bounded base64 data URLs with an allowed audio MIME type", () => {
	const header = "data:audio/wav;base64,";
	const maxSize = btoa("\0".repeat(cinematicAudioMaxBytes));
	const aboveMax = btoa("\0".repeat(cinematicAudioMaxBytes + 1));
	expect(isEmbeddedCinematicAudio(`${header}${maxSize}`)).toBe(true);
	expect(isEmbeddedCinematicAudio(`${header}${aboveMax}`)).toBe(false);
	for (const value of [
		"blob:http://localhost/voice",
		"data:text/html;base64,AAAA",
		"data:audio/wav,AAAA",
		"data:audio/wav;codecs=pcm;base64,AAAA",
		header,
		`${header}a===`,
		`${header}a a=`,
		`${header}a?a=`,
		`${header}aa`,
	]) {
		expect(isEmbeddedCinematicAudio(value)).toBe(false);
	}
});

it("imports WAV bytes durably and handles unsupported, oversized and empty files", async () => {
	await expect(
		readCinematicAudioFile(wavFile("Watch.WAV", "application/octet-stream")),
	).resolves.toEqual({
		sourceName: "Watch.WAV",
		url: `data:audio/wav;base64,${wav}`,
	});
	await expect(
		readCinematicAudioFile(
			new File(["text"], "notes.wav", { type: "text/plain" }),
		),
	).rejects.toThrow("Choose a WAV");
	await expect(
		readCinematicAudioFile(
			new File([new Uint8Array(cinematicAudioMaxBytes + 1)], "huge.ogg"),
		),
	).rejects.toThrow("up to 2 MiB");
	await expect(
		readCinematicAudioFile(new File([], "empty.wav")),
	).rejects.toThrow("empty");
});

it("adds an imported cue from the file control and allows its source to be replaced with a URL", async () => {
	const onAdd = vi.fn();
	const onChange = vi.fn();
	const { rerender } = render(
		<AudioCueCreator onAdd={onAdd} onCancel={vi.fn()} />,
	);
	fireEvent.change(screen.getByLabelText("Import audio file"), {
		target: { files: [wavFile("watch.wav", "audio/x-wav")] },
	});
	expect(await screen.findByText("watch.wav")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Add audio cue" }));
	const url = `data:audio/wav;base64,${wav}`;
	expect(onAdd).toHaveBeenCalledWith(url, "watch.wav");

	rerender(
		<CinematicAudioSourceFields
			url={url}
			sourceName="watch.wav"
			onChange={onChange}
		/>,
	);
	const urlField = screen.getByLabelText("Audio file URL");
	expect(urlField).toHaveValue("");
	fireEvent.change(urlField, { target: { value: "/audio/other.wav" } });
	fireEvent.blur(urlField);
	expect(onChange).toHaveBeenCalledWith("/audio/other.wav");
});
