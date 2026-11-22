import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { CinematicTracks } from "../editor/cinematics/CinematicTracks";
import type { CinematicSequence } from "../types/game";

const sequence: CinematicSequence = {
	areaId: "watchtower",
	shots: [
		{
			id: "watchtower-shot",
			durationMs: 2000,
			from: {
				position: { x: 1, y: 3, z: 6 },
				lookAt: { x: 1, y: 1, z: 0 },
			},
		},
	],
	cues: [
		{
			id: "dialogue",
			shotId: "watchtower-shot",
			type: "subtitle",
			startMs: 100,
			durationMs: 900,
			text: "Light the beacon.",
		},
	],
};

function renderTracks() {
	const change = vi.fn<(value: CinematicSequence) => void>();
	function Harness() {
		const [authored, setAuthored] = useState(sequence);
		const [timeMs, setTime] = useState(0);
		return (
			<CinematicTracks
				sequence={authored}
				actors={[{ id: "oswin", name: "Oswin" }]}
				selectedShotIndex={0}
				timeMs={timeMs}
				onSeek={setTime}
				onSelectShot={() => {}}
				onAddShot={() => {}}
				onChange={(value) => {
					setAuthored(value);
					change(value);
				}}
			/>
		);
	}
	render(<Harness />);
	return change;
}

it("seeks to a clip and commits a cue drag only when its pointer is released", () => {
	const change = renderTracks();
	const clip = screen.getByRole("button", { name: "Light the beacon." });
	const lane = clip.parentElement as HTMLElement;
	lane.getBoundingClientRect = () => new DOMRect(0, 0, 200, 23);
	const begin = { pointerId: 1, button: 0, clientX: 10 };
	const drag = { pointerId: 1, clientX: 50 };

	fireEvent.click(clip);
	expect(screen.getByLabelText("Timeline playhead")).toHaveValue("100");
	fireEvent.pointerDown(clip, begin);
	fireEvent.pointerMove(clip, drag);
	fireEvent.pointerCancel(clip, drag);
	expect(change).not.toHaveBeenCalled();

	fireEvent.pointerDown(clip, begin);
	fireEvent.pointerMove(clip, drag);
	fireEvent.pointerUp(clip, drag);
	expect(change).toHaveBeenCalledTimes(1);
	const movedCue = change.mock.calls[0][0].cues?.[0];
	expect(movedCue).toMatchObject({
		id: "dialogue",
		startMs: 500,
		durationMs: 900,
	});
	expect(movedCue?.shotId).toBeUndefined();
	expect(screen.getByLabelText("Timeline playhead")).toHaveValue("500");
	expect(clip).toHaveAttribute("aria-pressed", "true");
});

it("adds and edits an actor cue at the ruler position alongside existing shots and dialogue", () => {
	const change = renderTracks();
	fireEvent.change(screen.getByLabelText("Timeline playhead"), {
		target: { value: "350" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add actor cue" }));
	const inspector = within(
		screen.getByRole("region", { name: "Advanced inspector" }),
	);
	fireEvent.change(inspector.getByLabelText("Animation"), {
		target: { value: "interact" },
	});

	expect(change).toHaveBeenLastCalledWith({
		...sequence,
		cues: [
			...(sequence.cues ?? []),
			{
				id: expect.any(String),
				type: "actor",
				actorId: "oswin",
				startMs: 350,
				durationMs: 2000,
				animation: "interact",
			},
		],
	});
});
