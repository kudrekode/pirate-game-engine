import { Bone, Grid2X2, Link2, RotateCcw, Save, Waypoints } from "lucide-react";
import { useState } from "react";
import { Button, Input, NativeSelect, Textarea } from "@/components/ui/control";
import {
	ASSET_CREATOR_CATEGORIES,
	ZERO_ASSET_VECTOR,
} from "../../data/assetCreator";
import { SWORD } from "../../data/sword";
import type { ThreeVisualAssetDefinition } from "../../runtime/three/threeVisualAssetRegistry";
import type {
	AssetCreatorAttachment,
	AssetCreatorCategory,
	AssetCreatorEffect,
	AssetCreatorVariant,
	AssetCreatorVector,
} from "../../types/game";
import { ProjectDialog } from "../project/ProjectDialog";
import type { PreviewRig, PreviewSettings } from "./AssetPreview";
import { creatorCategory } from "./assetCreatorLibrary";

export function NumberField({
	label,
	value,
	min,
	max,
	step = 1,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
}) {
	return (
		<label>
			{label}
			<Input
				type="number"
				value={Number(value.toFixed(4))}
				min={min}
				max={max}
				step={step}
				onChange={(event) => {
					const next = event.target.valueAsNumber;
					if (Number.isFinite(next))
						onChange(Math.min(max, Math.max(min, next)));
				}}
			/>
		</label>
	);
}

export function VectorFields({
	label,
	value,
	limit = 360,
	step = 1,
	onChange,
}: {
	label: string;
	value: AssetCreatorVector;
	limit?: number;
	step?: number;
	onChange: (value: AssetCreatorVector) => void;
}) {
	return (
		<fieldset className="creator-vector">
			<legend>{label}</legend>
			{(["x", "y", "z"] as const).map((axis) => (
				<NumberField
					key={axis}
					label={axis.toUpperCase()}
					value={value[axis]}
					min={-limit}
					max={limit}
					step={step}
					onChange={(next) => onChange({ ...value, [axis]: next })}
				/>
			))}
		</fieldset>
	);
}

export function SaveControls({
	canSave,
	canFork,
	dirty,
	onSave,
	onFork,
	onRevert,
}: {
	canSave: boolean;
	canFork: boolean;
	dirty: boolean;
	onSave: () => void;
	onFork: () => void;
	onRevert: () => void;
}) {
	return (
		<div className="creator-save-controls">
			<Button
				variant="default"
				type="button"
				onClick={onSave}
				disabled={!canSave || !dirty}
			>
				<Save aria-hidden="true" />
				Save
			</Button>
			<Button
				variant="outline"
				type="button"
				onClick={onFork}
				disabled={!canFork}
			>
				Save as New
			</Button>
			<Button
				variant="outline"
				type="button"
				onClick={onRevert}
				disabled={!dirty}
			>
				Revert
			</Button>
		</div>
	);
}

function defaultAttachment(
	assetId: string,
	socket: string,
): AssetCreatorAttachment {
	const sword = assetId === SWORD.visualAssetId && socket === "right_hand";
	return {
		assetId,
		socket,
		scale: 1,
		position: sword
			? {
					x: SWORD.grip.position[0],
					y: SWORD.grip.position[1],
					z: SWORD.grip.position[2],
				}
			: ZERO_ASSET_VECTOR,
		rotation: sword ? { x: 90, y: 0, z: -22.5 } : ZERO_ASSET_VECTOR,
	};
}

export function AssetFields({
	draft,
	rig,
	bone,
	setBone,
	props,
	effects,
	onChange,
}: {
	draft: AssetCreatorVariant;
	rig: PreviewRig;
	bone: string;
	setBone: (name: string) => void;
	props: ThreeVisualAssetDefinition[];
	effects: AssetCreatorEffect[];
	onChange: (patch: Partial<AssetCreatorVariant>) => void;
}) {
	const selectedBone = rig.bones.find((entry) => entry.name === bone);
	const attachment = draft.attachment;
	const depths = new Map<string, number>();
	for (const entry of rig.bones)
		depths.set(
			entry.name,
			entry.parent ? 1 + (depths.get(entry.parent) ?? 0) : 0,
		);
	return (
		<>
			<div className="creator-fields">
				<label>
					Asset name
					<Input
						value={draft.name}
						onChange={(event) => onChange({ name: event.target.value })}
					/>
				</label>
				<NumberField
					label="Model scale"
					min={0.1}
					max={5}
					step={0.05}
					value={draft.scale}
					onChange={(scale) => onChange({ scale })}
				/>
				<div className="creator-color">
					<label>
						Material tint
						<Input
							type="color"
							value={draft.tint ?? "#ffffff"}
							onChange={(event) => onChange({ tint: event.target.value })}
						/>
					</label>
					{draft.tint && (
						<Button
							variant="outline"
							type="button"
							onClick={() => onChange({ tint: undefined })}
						>
							Clear tint
						</Button>
					)}
				</div>
				<label>
					Description
					<Textarea
						rows={2}
						value={draft.description}
						onChange={(event) => onChange({ description: event.target.value })}
					/>
				</label>
				{(effects.length > 0 || draft.effectId) && (
					<label>
						Preview effect
						<NativeSelect
							value={draft.effectId ?? ""}
							onChange={(event) =>
								onChange({ effectId: event.target.value || undefined })
							}
						>
							<option value="">None</option>
							{draft.effectId &&
								!effects.some((effect) => effect.id === draft.effectId) && (
									<option value={draft.effectId}>Unavailable effect</option>
								)}
							{effects.map((effect) => (
								<option key={effect.id} value={effect.id}>
									{effect.name}
								</option>
							))}
						</NativeSelect>
					</label>
				)}
			</div>
			{rig.bones.length > 0 && (
				<div className="creator-fields">
					<h4>
						Skeleton <small>{rig.bones.length} bones</small>
					</h4>
					<label>
						Bone
						<NativeSelect
							size={5}
							value={bone}
							onChange={(event) => setBone(event.target.value)}
						>
							<option value="">Select a bone</option>
							{rig.bones.map((entry) => (
								<option key={entry.name} value={entry.name}>
									{"  ".repeat(Math.min(8, depths.get(entry.name) ?? 0))}
									{entry.name}
								</option>
							))}
						</NativeSelect>
					</label>
					{selectedBone && (
						<>
							<VectorFields
								label="Local rotation (°)"
								value={draft.pose[bone] ?? selectedBone.rotation}
								onChange={(rotation) =>
									onChange({ pose: { ...draft.pose, [bone]: rotation } })
								}
							/>
							<div className="creator-inline">
								{Object.getOwnPropertyDescriptor(draft.pose, bone) !==
									undefined && (
									<Button
										variant="outline"
										type="button"
										onClick={() => {
											const pose = { ...draft.pose };
											delete pose[bone];
											onChange({ pose });
										}}
									>
										Reset bone
									</Button>
								)}
								{Object.keys(draft.pose).length > 0 && (
									<Button
										variant="outline"
										type="button"
										onClick={() => onChange({ pose: {} })}
									>
										Reset pose
									</Button>
								)}
							</div>
						</>
					)}
				</div>
			)}
			{rig.sockets.length > 0 && (
				<div className="creator-fields">
					<h4>Prop attachment</h4>
					<label>
						Attached prop
						<NativeSelect
							value={attachment?.assetId ?? ""}
							onChange={(event) => {
								const id = event.target.value;
								const socket =
									attachment?.socket ??
									rig.sockets.find((entry) => entry.name === "right_hand")
										?.name ??
									rig.sockets[0].name;
								onChange({
									attachment: id ? defaultAttachment(id, socket) : undefined,
								});
							}}
						>
							<option value="">None</option>
							{attachment &&
								!props.some((prop) => prop.id === attachment.assetId) && (
									<option value={attachment.assetId}>Unavailable prop</option>
								)}
							{props.map((prop) => (
								<option key={prop.id} value={prop.id}>
									{prop.name}
								</option>
							))}
						</NativeSelect>
					</label>
					{attachment && (
						<>
							<label>
								Rig socket
								<NativeSelect
									value={attachment.socket}
									onChange={(event) =>
										onChange({
											attachment: defaultAttachment(
												attachment.assetId,
												event.target.value,
											),
										})
									}
								>
									{!rig.sockets.some(
										(socket) => socket.name === attachment.socket,
									) && (
										<option value={attachment.socket}>
											Unavailable socket
										</option>
									)}
									{rig.sockets.map((socket) => (
										<option key={socket.name} value={socket.name}>
											{socketLabel(socket.name)}
										</option>
									))}
								</NativeSelect>
							</label>
							<details className="creator-local-transform">
								<summary>Local transform</summary>
								<VectorFields
									label="Position (m)"
									limit={20}
									step={0.01}
									value={attachment.position}
									onChange={(position) =>
										onChange({ attachment: { ...attachment, position } })
									}
								/>
								<VectorFields
									label="Rotation (°)"
									value={attachment.rotation}
									onChange={(rotation) =>
										onChange({ attachment: { ...attachment, rotation } })
									}
								/>
								<NumberField
									label="Attachment scale"
									min={0.01}
									max={10}
									step={0.05}
									value={attachment.scale}
									onChange={(scale) =>
										onChange({ attachment: { ...attachment, scale } })
									}
								/>
							</details>
						</>
					)}
				</div>
			)}
		</>
	);
}

export function socketLabel(name: string) {
	return name
		.replace(/_/g, " ")
		.replace(/^./, (letter) => letter.toUpperCase());
}

export const initialPreviewSettings: PreviewSettings = {
	background: "grid",
	skeleton: false,
	wireframe: false,
	ground: true,
	light: "studio",
	linked: false,
	reset: 0,
};

export function PreviewToolbar({
	settings,
	onChange,
}: {
	settings: PreviewSettings;
	onChange: (settings: PreviewSettings) => void;
}) {
	return (
		<fieldset className="creator-footer" aria-label="Preview settings">
			<span>Background</span>
			{(["grid", "black", "white", "forest", "castle"] as const).map(
				(background) => (
					<Button
						variant="outline"
						size="sm"
						key={background}
						type="button"
						aria-pressed={settings.background === background}
						onClick={() => onChange({ ...settings, background })}
					>
						{background}
					</Button>
				),
			)}
			<span className="creator-divider" aria-hidden="true" />
			{(
				[
					["skeleton", "Skeleton", Bone],
					["wireframe", "Wireframe", Waypoints],
					["ground", "Ground", Grid2X2],
					["linked", "Link cameras", Link2],
				] as const
			).map(([key, label, Icon]) => (
				<Button
					variant="outline"
					size="sm"
					type="button"
					key={key}
					aria-label={label}
					title={label}
					aria-pressed={settings[key]}
					onClick={() => onChange({ ...settings, [key]: !settings[key] })}
				>
					<Icon aria-hidden="true" />
					<span>{label}</span>
				</Button>
			))}
			<label>
				Lighting
				<NativeSelect
					value={settings.light}
					onChange={(event) =>
						onChange({
							...settings,
							light: event.target.value as PreviewSettings["light"],
						})
					}
				>
					<option value="studio">Studio</option>
					<option value="warm">Warm</option>
					<option value="cool">Cool</option>
				</NativeSelect>
			</label>
			<Button
				variant="outline"
				size="sm"
				type="button"
				aria-label="Reset view"
				title="Reset view"
				onClick={() => onChange({ ...settings, reset: settings.reset + 1 })}
			>
				<RotateCcw aria-hidden="true" />
				<span>Reset view</span>
			</Button>
		</fieldset>
	);
}

export function CreateAssetDialog({
	assets,
	current,
	onClose,
	onCreate,
}: {
	assets: ThreeVisualAssetDefinition[];
	current: ThreeVisualAssetDefinition;
	onClose: () => void;
	onCreate: (
		base: ThreeVisualAssetDefinition,
		values: Pick<
			AssetCreatorVariant,
			"name" | "category" | "description" | "constraint" | "referenceImages"
		>,
	) => void;
}) {
	const [name, setName] = useState("");
	const [category, setCategory] = useState(creatorCategory(current));
	const [baseId, setBaseId] = useState(current.id);
	const [description, setDescription] = useState("");
	const [constraint, setConstraint] =
		useState<AssetCreatorVariant["constraint"]>("Constrained");
	const [images, setImages] = useState("");
	const candidates = assets.filter(
		(asset) => creatorCategory(asset) === category,
	);
	const base = candidates.find((asset) => asset.id === baseId) ?? candidates[0];
	return (
		<ProjectDialog title="Create Asset" onClose={onClose}>
			<form
				className="creator-dialog-fields"
				onSubmit={(event) => {
					event.preventDefault();
					if (base && name.trim())
						onCreate(base, {
							name: name.trim(),
							category,
							description,
							constraint,
							referenceImages: images
								.split(/\r?\n/)
								.map((image) => image.trim())
								.filter(Boolean),
						});
				}}
			>
				<label>
					Name
					<Input
						required
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<label>
					Category
					<NativeSelect
						value={category}
						onChange={(event) =>
							setCategory(event.target.value as AssetCreatorCategory)
						}
					>
						{ASSET_CREATOR_CATEGORIES.map((value) => (
							<option key={value}>{value}</option>
						))}
					</NativeSelect>
				</label>
				<label>
					Base asset or variant
					<NativeSelect
						value={base?.id ?? ""}
						onChange={(event) => setBaseId(event.target.value)}
					>
						{candidates.map((asset) => (
							<option key={asset.id} value={asset.id}>
								{asset.name}
							</option>
						))}
					</NativeSelect>
				</label>
				<label>
					Description
					<Textarea
						rows={2}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
				</label>
				<label>
					Constraint level
					<NativeSelect
						value={constraint}
						onChange={(event) =>
							setConstraint(
								event.target.value as AssetCreatorVariant["constraint"],
							)
						}
					>
						<option>Constrained</option>
						<option>Extended</option>
						<option>Custom</option>
					</NativeSelect>
				</label>
				<label>
					Reference image URLs (optional, one per line)
					<Textarea
						rows={2}
						value={images}
						onChange={(event) => setImages(event.target.value)}
					/>
				</label>
				<p>
					This creates a variant from the selected GLB. For new character
					geometry, open Blender Studio.
				</p>
				<div className="project-dialog-actions">
					<Button
						variant="default"
						type="submit"
						disabled={
							!base ||
							!name.trim() ||
							images
								.split(/\r?\n/)
								.some(
									(image) =>
										image.trim() && !/^https?:\/\//i.test(image.trim()),
								)
						}
					>
						Create variant
					</Button>
					<Button variant="outline" type="button" onClick={onClose}>
						Cancel
					</Button>
				</div>
			</form>
		</ProjectDialog>
	);
}

export function NameResourceDialog({
	name: initial,
	title,
	onClose,
	onSave,
}: {
	name: string;
	title: string;
	onClose: () => void;
	onSave: (name: string) => void;
}) {
	const [name, setName] = useState(initial);
	return (
		<ProjectDialog title={title} onClose={onClose}>
			<form
				className="creator-dialog-fields"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim()) onSave(name.trim());
				}}
			>
				<label>
					Name
					<Input
						required
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<div className="project-dialog-actions">
					<Button variant="default" type="submit">
						Save as New
					</Button>
					<Button variant="outline" type="button" onClick={onClose}>
						Cancel
					</Button>
				</div>
			</form>
		</ProjectDialog>
	);
}
