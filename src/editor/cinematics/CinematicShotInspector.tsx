import { useState } from "react";
import { Button, Input, NativeSelect, Textarea } from "@/components/ui/control";
import { DEFAULT_CINEMATIC_FOV } from "../../runtime/three/cinematicCamera";
import {
	CINEMATIC_ACTOR_ANIMATIONS,
	type CinematicActorAnimation,
	type CinematicActorCue,
	type CinematicShot,
	type CinematicShotPreset,
	type CinematicSubtitleCue,
} from "../../types/game";
import { ShotFields } from "../sections/CinematicTimelineFields";
import { CINEMATIC_PRESETS, type CinematicSubject } from "./cinematicFraming";

export const cinematicAnimationLabels: Record<CinematicActorAnimation, string> =
	{
		idle: "Idle",
		walk: "Walk in place",
		run: "Run in place",
		interact: "Gesture",
		pickup: "Pick up",
		attack: "Attack",
	};

export function shotLabel(shot: CinematicShot) {
	return (
		CINEMATIC_PRESETS.find(({ id }) => id === shot.preset)?.label ??
		(shot.preset === "current-view" ? "Current View" : "Custom")
	);
}

const actorOnly = (preset: CinematicShotPreset | undefined) =>
	preset === "close-up" || preset === "over-shoulder" || preset === "two-shot";

export function CinematicShotInspector({
	shot,
	index,
	shotCount,
	subtitle,
	gesture,
	actors,
	landmarks,
	onFrame,
	onShotChange,
	onSubtitle,
	onGesture,
	onMove,
	onDuplicate,
	onRemove,
}: {
	shot: CinematicShot;
	index: number;
	shotCount: number;
	subtitle?: CinematicSubtitleCue;
	gesture?: CinematicActorCue;
	actors: CinematicSubject[];
	landmarks: CinematicSubject[];
	onFrame: (
		preset: CinematicShotPreset,
		target?: string,
		secondary?: string,
	) => void;
	onShotChange: (shot: CinematicShot) => void;
	onSubtitle: (text: string, speakerId: string) => void;
	onGesture: (
		animation: CinematicActorAnimation | undefined,
		actorId: string,
	) => void;
	onMove: (direction: number) => void;
	onDuplicate: () => void;
	onRemove: () => void;
}) {
	const [speakerDraft, setSpeakerDraft] = useState<string>();
	const [actorDraft, setActorDraft] = useState<string>();
	const speakerId = subtitle
		? (subtitle.speakerId ??
			actors.find(
				(actor) =>
					actor.name === subtitle.speaker ||
					(subtitle.speaker &&
						actor.name.split(/[ (]/).includes(subtitle.speaker)),
			)?.id ??
			"")
		: (speakerDraft ?? "");
	const actorId =
		(gesture?.actorId ?? actorDraft ?? speakerId) ||
		(actors.some((actor) => actor.id === shot.targetId)
			? (shot.targetId ?? "")
			: (actors[0]?.id ?? ""));
	const targets = actorOnly(shot.preset) ? actors : [...actors, ...landmarks];
	const twoActors =
		shot.preset === "two-shot" || shot.preset === "over-shoulder";

	return (
		<section aria-label="Shot inspector" className="cinema-inspector-fields">
			<header>
				<p className="cinema-eyebrow">Shot inspector</p>
				<h2>
					Shot {index + 1} · {shotLabel(shot)}
				</h2>
			</header>
			<label>
				Shot preset
				<NativeSelect
					value={shot.preset ?? ""}
					onChange={(event) =>
						onFrame(event.target.value as CinematicShotPreset)
					}
				>
					{!shot.preset && <option value="">Custom</option>}
					{CINEMATIC_PRESETS.map(({ id, label }) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
					{shot.preset === "current-view" && (
						<option value="current-view">Current View</option>
					)}
				</NativeSelect>
			</label>
			{shot.preset && shot.preset !== "current-view" && (
				<label>
					Look at
					<NativeSelect
						value={shot.targetId ?? ""}
						onChange={(event) =>
							onFrame(
								shot.preset ?? "establishing",
								event.target.value,
								shot.secondaryTargetId,
							)
						}
					>
						{!targets.some(({ id }) => id === shot.targetId) && (
							<option value={shot.targetId ?? ""}>Missing target</option>
						)}
						{targets.map(({ id, name }) => (
							<option key={id} value={id}>
								{name}
							</option>
						))}
					</NativeSelect>
				</label>
			)}
			{twoActors && (
				<label>
					{shot.preset === "over-shoulder"
						? "Foreground actor"
						: "Second actor"}
					<NativeSelect
						value={shot.secondaryTargetId ?? ""}
						onChange={(event) =>
							onFrame(
								shot.preset ?? "two-shot",
								shot.targetId,
								event.target.value,
							)
						}
					>
						{!actors.some(({ id }) => id === shot.secondaryTargetId) && (
							<option value={shot.secondaryTargetId ?? ""}>
								Choose an actor
							</option>
						)}
						{actors
							.filter(({ id }) => id !== shot.targetId)
							.map(({ id, name }) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
					</NativeSelect>
				</label>
			)}
			<label>
				Speaker
				<NativeSelect
					value={speakerId}
					onChange={(event) => {
						if (subtitle) onSubtitle(subtitle.text, event.target.value);
						else setSpeakerDraft(event.target.value);
					}}
				>
					<option value="">
						{subtitle?.speaker && !speakerId ? subtitle.speaker : "Narrator"}
					</option>
					{actors.map(({ id, name }) => (
						<option key={id} value={id}>
							{name}
						</option>
					))}
				</NativeSelect>
			</label>
			<label>
				Dialogue / Subtitle
				<Textarea
					rows={3}
					key={subtitle?.text}
					defaultValue={subtitle?.text ?? ""}
					onBlur={(event) => {
						const text = event.currentTarget.value.trim();
						if (text !== (subtitle?.text ?? "")) onSubtitle(text, speakerId);
					}}
				/>
			</label>
			<label>
				Actor
				<NativeSelect
					value={actorId}
					onChange={(event) => {
						if (gesture) onGesture(gesture.animation, event.target.value);
						else setActorDraft(event.target.value);
					}}
				>
					{actors.map(({ id, name }) => (
						<option key={id} value={id}>
							{name}
						</option>
					))}
				</NativeSelect>
			</label>
			<label>
				Actor action
				<NativeSelect
					value={gesture?.animation ?? ""}
					disabled={!actorId}
					onChange={(event) =>
						onGesture(
							(event.target.value || undefined) as
								| CinematicActorAnimation
								| undefined,
							actorId,
						)
					}
				>
					<option value="">None</option>
					{CINEMATIC_ACTOR_ANIMATIONS.map((animation) => (
						<option key={animation} value={animation}>
							{cinematicAnimationLabels[animation]}
						</option>
					))}
				</NativeSelect>
			</label>
			<div className="cinema-duration-fields">
				<label>
					Timing
					<NativeSelect
						value={shot.durationMode ?? "manual"}
						onChange={(event) =>
							onShotChange({
								...shot,
								durationMode: event.target.value === "auto" ? "auto" : "manual",
							})
						}
					>
						<option value="auto">Auto from dialogue</option>
						<option value="manual">Manual</option>
					</NativeSelect>
				</label>
				{shot.durationMode === "auto" ? (
					<span>{(shot.durationMs / 1000).toFixed(1)} s</span>
				) : (
					<NumberInput
						label="Seconds"
						min={0.001}
						value={shot.durationMs / 1000}
						onChange={(value) =>
							onShotChange({ ...shot, durationMs: Math.round(value * 1000) })
						}
					/>
				)}
			</div>
			<div className="cinema-actions">
				<Button type="button" disabled={index === 0} onClick={() => onMove(-1)}>
					← Earlier
				</Button>
				<Button
					type="button"
					disabled={index === shotCount - 1}
					onClick={() => onMove(1)}
				>
					Later →
				</Button>
				<Button type="button" onClick={onDuplicate}>
					Duplicate
				</Button>
				<Button type="button" disabled={shotCount <= 1} onClick={onRemove}>
					Delete shot
				</Button>
			</div>
		</section>
	);
}

function NumberInput({
	label,
	value,
	onChange,
	min,
	max,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
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
				step="any"
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
				onBlur={(event) => {
					const input = event.currentTarget;
					if (input.validity.valid && Number.isFinite(input.valueAsNumber)) {
						if (input.valueAsNumber !== value) onChange(input.valueAsNumber);
					} else input.value = String(value);
				}}
			/>
		</label>
	);
}

export function AdvancedCameraFields({
	shot,
	trackingTarget,
	onChange,
}: {
	shot: CinematicShot;
	trackingTarget?: CinematicSubject;
	onChange: (shot: CinematicShot) => void;
}) {
	return (
		<>
			<div className="cinema-duration-fields">
				<NumberInput
					label="Field of view"
					min={15}
					max={110}
					value={shot.fov ?? DEFAULT_CINEMATIC_FOV}
					onChange={(fov) => onChange({ ...shot, fov })}
				/>
				<label>
					Interpolation
					<NativeSelect
						value={shot.ease ?? "smooth"}
						onChange={(event) =>
							onChange({
								...shot,
								ease: event.target.value === "linear" ? "linear" : "smooth",
							})
						}
					>
						<option value="smooth">Ease in and out</option>
						<option value="linear">Linear</option>
					</NativeSelect>
				</label>
			</div>
			<label className="cinema-check">
				<Input
					type="checkbox"
					checked={!!shot.clearance}
					onChange={(event) =>
						onChange({ ...shot, clearance: event.target.checked })
					}
				/>
				Scene collision avoidance
			</label>
			{trackingTarget && (
				<label className="cinema-check">
					<Input
						type="checkbox"
						checked={!!shot.trackingOrigin}
						onChange={(event) =>
							onChange({
								...shot,
								trackingOrigin: event.target.checked
									? trackingTarget.position
									: undefined,
							})
						}
					/>
					Track actor
				</label>
			)}
			{(["positionOffset", "lookAtOffset"] as const).map((field) => (
				<fieldset key={field}>
					<legend>
						{field === "positionOffset" ? "Camera offset" : "Target offset"}
					</legend>
					<div className="cinematic-coordinate-fields">
						{(["x", "y", "z"] as const).map((axis) => (
							<NumberInput
								key={axis}
								label={axis.toUpperCase()}
								value={shot[field]?.[axis] ?? 0}
								onChange={(value) =>
									onChange({
										...shot,
										[field]: {
											x: 0,
											y: 0,
											z: 0,
											...shot[field],
											[axis]: value,
										},
									})
								}
							/>
						))}
					</div>
				</fieldset>
			))}
			<details>
				<summary>Camera keyframes and timing</summary>
				<ShotFields
					shot={shot}
					onChange={(next) =>
						onChange({
							...next,
							durationMode:
								next.durationMs !== shot.durationMs
									? "manual"
									: shot.durationMode,
						})
					}
				/>
			</details>
		</>
	);
}
