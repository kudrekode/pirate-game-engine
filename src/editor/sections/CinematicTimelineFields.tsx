import { isCinematicAudioUrl } from "../../runtime/cinematicTimeline";
import type {
	CinematicActorAnimation,
	CinematicCamera,
	CinematicCue,
	CinematicSequence,
} from "../../types/game";

type Shot = CinematicSequence["shots"][number];

const actorAnimations: Record<CinematicActorAnimation, string> = {
	idle: "Idle",
	walk: "Walk in place",
	run: "Run in place",
	interact: "Interact",
	pickup: "Pick up",
	attack: "Attack",
};

function NumberField({
	label,
	value,
	onChange,
	min,
	max,
	step = "any",
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number | "any";
}) {
	return (
		<label>
			{label}
			<input
				key={value}
				type="number"
				defaultValue={value}
				min={min}
				max={max}
				step={step}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
				onBlur={(event) => {
					const next = event.currentTarget.valueAsNumber;
					if (!Number.isFinite(next) || !event.currentTarget.validity.valid) {
						event.currentTarget.value = String(value);
						return;
					}
					if (next !== value) onChange(next);
				}}
			/>
		</label>
	);
}

function CameraPoseFields({
	label,
	pose,
	onChange,
}: {
	label: string;
	pose: CinematicCamera;
	onChange: (pose: CinematicCamera) => void;
}) {
	return (
		<fieldset>
			<legend>{label}</legend>
			<div className="cinematic-coordinate-fields">
				{(["position", "lookAt"] as const).map((point) =>
					(["x", "y", "z"] as const).map((axis) => (
						<NumberField
							key={`${point}-${axis}`}
							label={`${point === "position" ? "Position" : "Look at"} ${axis.toUpperCase()}`}
							value={pose[point][axis]}
							onChange={(value) =>
								onChange({
									...pose,
									[point]: { ...pose[point], [axis]: value },
								})
							}
						/>
					)),
				)}
			</div>
		</fieldset>
	);
}

export function ShotFields({
	shot,
	onChange,
}: {
	shot: Shot;
	onChange: (shot: Shot) => void;
}) {
	return (
		<>
			<NumberField
				label="Shot duration (ms)"
				value={shot.durationMs}
				min={1}
				step={1}
				onChange={(durationMs) => onChange({ ...shot, durationMs })}
			/>
			<CameraPoseFields
				label="Start pose"
				pose={shot.from}
				onChange={(from) => onChange({ ...shot, from })}
			/>
			<label className="checkbox-row">
				<input
					type="checkbox"
					checked={!!shot.to}
					onChange={(event) =>
						onChange({
							...shot,
							to: event.target.checked ? shot.from : undefined,
						})
					}
				/>
				Move camera during shot
			</label>
			{shot.to && (
				<CameraPoseFields
					label="End pose"
					pose={shot.to}
					onChange={(to) => onChange({ ...shot, to })}
				/>
			)}
		</>
	);
}

export function CueFields({
	cue,
	actors,
	target,
	onChange,
}: {
	cue: CinematicCue;
	actors: { id: string; name: string }[];
	target: CinematicCamera["lookAt"];
	onChange: (cue: CinematicCue) => void;
}) {
	return (
		<>
			<div className="cinematic-timing-fields">
				<NumberField
					label="Start (ms)"
					value={cue.startMs}
					min={0}
					step={1}
					onChange={(startMs) => onChange({ ...cue, startMs })}
				/>
				<NumberField
					label="Cue duration (ms)"
					value={cue.durationMs}
					min={1}
					step={1}
					onChange={(durationMs) => onChange({ ...cue, durationMs })}
				/>
			</div>
			{cue.type === "subtitle" && (
				<>
					<label>
						Subtitle speaker
						<input
							value={cue.speaker ?? ""}
							onChange={(event) =>
								onChange({ ...cue, speaker: event.target.value || undefined })
							}
						/>
					</label>
					<label>
						Subtitle text
						<textarea
							key={cue.text}
							rows={3}
							required
							defaultValue={cue.text}
							onBlur={(event) => {
								const text = event.currentTarget.value.trim();
								if (text) onChange({ ...cue, text });
								else event.currentTarget.value = cue.text;
							}}
						/>
					</label>
				</>
			)}
			{cue.type === "actor" && (
				<>
					<label>
						Actor
						<select
							value={cue.actorId}
							onChange={(event) =>
								onChange({ ...cue, actorId: event.target.value })
							}
						>
							{!actors.some(({ id }) => id === cue.actorId) && (
								<option value={cue.actorId}>
									Missing actor ({cue.actorId})
								</option>
							)}
							{actors.map(({ id, name }) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
						</select>
					</label>
					<label>
						Animation
						<select
							value={cue.animation ?? ""}
							onChange={(event) =>
								onChange({
									...cue,
									animation: (event.target.value || undefined) as
										| CinematicActorAnimation
										| undefined,
								})
							}
						>
							{cue.face && <option value="">None</option>}
							{Object.entries(actorAnimations).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</label>
					<label className="checkbox-row">
						<input
							type="checkbox"
							checked={!!cue.face}
							onChange={(event) =>
								onChange(
									event.target.checked
										? { ...cue, face: { x: target.x, z: target.z } }
										: {
												...cue,
												face: undefined,
												animation: cue.animation ?? "idle",
											},
								)
							}
						/>
						Face a map point
					</label>
					{cue.face && (
						<div className="cinematic-timing-fields">
							<NumberField
								label="Face X"
								value={cue.face.x}
								onChange={(x) =>
									onChange({ ...cue, face: { x, z: cue.face?.z ?? target.z } })
								}
							/>
							<NumberField
								label="Face Z"
								value={cue.face.z}
								onChange={(z) =>
									onChange({ ...cue, face: { x: cue.face?.x ?? target.x, z } })
								}
							/>
						</div>
					)}
				</>
			)}
			{cue.type === "audio" && (
				<>
					<label>
						Audio file URL
						<input
							key={cue.url}
							defaultValue={cue.url}
							required
							onBlur={(event) => {
								const url = event.currentTarget.value.trim();
								if (isCinematicAudioUrl(url)) onChange({ ...cue, url });
								else event.currentTarget.value = cue.url;
							}}
						/>
					</label>
					<div className="cinematic-timing-fields">
						<NumberField
							label="Volume"
							value={cue.volume ?? 1}
							min={0}
							max={1}
							onChange={(volume) => onChange({ ...cue, volume })}
						/>
						<NumberField
							label="Audio offset (ms)"
							value={cue.offsetMs ?? 0}
							min={0}
							step={1}
							onChange={(offsetMs) => onChange({ ...cue, offsetMs })}
						/>
					</div>
				</>
			)}
		</>
	);
}

export function AudioCueCreator({
	onAdd,
	onCancel,
}: {
	onAdd: (url: string) => void;
	onCancel: () => void;
}) {
	return (
		<form
			className="form-stack"
			onSubmit={(event) => {
				event.preventDefault();
				const url = String(
					new FormData(event.currentTarget).get("url") ?? "",
				).trim();
				if (isCinematicAudioUrl(url)) onAdd(url);
			}}
		>
			<label>
				Audio file URL
				<input
					name="url"
					required
					placeholder="/audio/voice.ogg or https://…"
					onChange={(event) => {
						const input = event.currentTarget;
						input.setCustomValidity(
							isCinematicAudioUrl(input.value.trim())
								? ""
								: "Enter a root-relative path or an HTTPS audio URL.",
						);
					}}
				/>
			</label>
			<div className="cinematic-editor-actions">
				<button type="submit" className="primary-button">
					Add audio cue
				</button>
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</form>
	);
}
