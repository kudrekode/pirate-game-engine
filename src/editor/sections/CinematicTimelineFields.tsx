import type { ReactNode } from "react";
import { Input, NativeSelect, Textarea } from "@/components/ui/control";
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
			<Input
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
				<Input
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
	linkSubtitleSpeaker = false,
	audioSourceFields,
}: {
	cue: CinematicCue;
	actors: { id: string; name: string }[];
	target?: CinematicCamera["lookAt"];
	onChange: (cue: CinematicCue) => void;
	linkSubtitleSpeaker?: boolean;
	audioSourceFields?: ReactNode;
}) {
	const face = cue.type === "actor" ? cue.face : undefined;
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
					{linkSubtitleSpeaker && (
						<label>
							Speaker actor
							<NativeSelect
								value={cue.speakerId ?? ""}
								onChange={(event) => {
									const speaker = actors.find(
										({ id }) => id === event.target.value,
									);
									onChange({
										...cue,
										speakerId: speaker?.id,
										speaker: speaker?.name ?? cue.speaker,
									});
								}}
							>
								<option value="">Use speaker name</option>
								{cue.speakerId &&
									!actors.some(({ id }) => id === cue.speakerId) && (
										<option value={cue.speakerId}>
											Missing actor ({cue.speakerId})
										</option>
									)}
								{actors.map(({ id, name }) => (
									<option key={id} value={id}>
										{name}
									</option>
								))}
							</NativeSelect>
						</label>
					)}
					<label>
						Subtitle speaker
						<Input
							value={cue.speaker ?? ""}
							disabled={linkSubtitleSpeaker && !!cue.speakerId}
							onChange={(event) =>
								onChange({ ...cue, speaker: event.target.value || undefined })
							}
						/>
					</label>
					<label>
						Subtitle text
						<Textarea
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
						<NativeSelect
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
						</NativeSelect>
					</label>
					<label>
						Animation
						<NativeSelect
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
						</NativeSelect>
					</label>
					<label className="checkbox-row">
						<Input
							type="checkbox"
							checked={!!cue.face}
							disabled={!cue.face && !target}
							onChange={(event) =>
								onChange(
									event.target.checked && target
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
					{face && (
						<div className="cinematic-timing-fields">
							<NumberField
								label="Face X"
								value={face.x}
								onChange={(x) => onChange({ ...cue, face: { ...face, x } })}
							/>
							<NumberField
								label="Face Z"
								value={face.z}
								onChange={(z) => onChange({ ...cue, face: { ...face, z } })}
							/>
						</div>
					)}
				</>
			)}
			{cue.type === "audio" && (
				<>
					{audioSourceFields ?? (
						<label>
							Audio file URL
							<Input
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
					)}
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
					{audioSourceFields && (
						<div className="cinematic-timing-fields">
							<NumberField
								label="Fade in (ms)"
								value={cue.fadeInMs ?? 0}
								min={0}
								step={1}
								onChange={(fadeInMs) => onChange({ ...cue, fadeInMs })}
							/>
							<NumberField
								label="Fade out (ms)"
								value={cue.fadeOutMs ?? 0}
								min={0}
								step={1}
								onChange={(fadeOutMs) => onChange({ ...cue, fadeOutMs })}
							/>
						</div>
					)}
				</>
			)}
		</>
	);
}
