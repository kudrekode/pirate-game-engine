import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { AnimationClip } from "three";
import {
	ASSET_CREATOR_CATEGORIES,
	assetCreatorVariantDraft,
	upsertAssetCreatorEntry,
	ZERO_ASSET_VECTOR,
} from "../../data/assetCreator";
import {
	listThreeVisualAssets,
	type ThreeVisualAssetDefinition,
} from "../../runtime/three/threeVisualAssetRegistry";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	AssetCreatorClip,
	AssetCreatorEffect,
	AssetCreatorLibrary,
	AssetCreatorVariant,
	GameProject,
} from "../../types/game";
import { AssetCreatorLauncher } from "../AssetCreatorLauncher";
import {
	AssetFields,
	CreateAssetDialog,
	initialPreviewSettings,
	NameResourceDialog,
	NumberField,
	PreviewToolbar,
	SaveControls,
	socketLabel,
	VectorFields,
} from "./AssetCreatorFields";
import {
	AssetPreview,
	EMPTY_PREVIEW_RIG,
	type PreviewRig,
} from "./AssetPreview";
import {
	applyAssetCreatorClipEdits,
	getAssetCreatorBoneTrack,
	readAssetCreatorRotation,
	upsertAssetCreatorKey,
	useAssetCreatorClip,
	useAssetCreatorClips,
} from "./assetCreatorClips";
import {
	assetDisplayName,
	creatorCategory,
	useCreatorThumbnails,
} from "./assetCreatorLibrary";
import "./assetCreator.css";

const EMPTY_LIBRARY: AssetCreatorLibrary = {
	variants: [],
	clips: [],
	effects: [],
};
const TABS = ["Assets", "Animations", "Effects"] as const;
type Tab = (typeof TABS)[number];
type Modal = "create" | "asset" | "clip" | "effect";
const STANDARD_EFFECTS: AssetCreatorEffect[] = [
	{
		id: "builtin-glow",
		name: "Lantern Glow",
		type: "glow",
		color: "#ffbc6a",
		intensity: 0.75,
		duration: 2,
		loop: true,
	},
	{
		id: "builtin-fog",
		name: "Lake Fog",
		type: "fog",
		color: "#b1bcce",
		intensity: 0.7,
		duration: 7,
		loop: true,
	},
	{
		id: "builtin-embers",
		name: "Fire Embers",
		type: "embers",
		color: "#ff813f",
		intensity: 0.8,
		duration: 3,
		loop: true,
	},
];

function newId(kind: string) {
	return `creator-${kind}-${crypto.randomUUID()}`;
}

function isDirty<T>(base: T | undefined, edit: T | undefined) {
	return edit !== undefined && JSON.stringify(edit) !== JSON.stringify(base);
}

function PanelHead({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="creator-panel-head">
			<h3>{title}</h3>
			<small>{children}</small>
		</div>
	);
}

function AssetLibrary({
	assets,
	project,
	selected,
	onSelect,
	onCreate,
}: {
	assets: ThreeVisualAssetDefinition[];
	project: GameProject;
	selected: string;
	onSelect: (asset: ThreeVisualAssetDefinition) => void;
	onCreate: () => void;
}) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string>("All");
	const [limit, setLimit] = useState(16);
	const filtered = useMemo(
		() =>
			assets.filter((asset) => {
				const group = creatorCategory(asset);
				return (
					(category === "All" || group === category) &&
					`${assetDisplayName(asset, project)} ${asset.name} ${group} ${asset.tags?.join(" ") ?? ""}`
						.toLowerCase()
						.includes(query.trim().toLowerCase())
				);
			}),
		[assets, category, project, query],
	);
	const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
	const thumbnails = useCreatorThumbnails(visible);
	return (
		<>
			<PanelHead title="Asset Library">
				{assets.length} asset definitions
			</PanelHead>
			<div className="creator-search">
				<input
					aria-label="Search assets"
					placeholder="Search assets…"
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setLimit(16);
					}}
				/>
			</div>
			<fieldset className="creator-categories" aria-label="Asset categories">
				{["All", ...ASSET_CREATOR_CATEGORIES].map((value) => (
					<button
						type="button"
						key={value}
						aria-pressed={category === value}
						onClick={() => {
							setCategory(value);
							setLimit(16);
						}}
					>
						{value}
					</button>
				))}
			</fieldset>
			<div className="creator-asset-grid">
				<button type="button" className="creator-create" onClick={onCreate}>
					<span aria-hidden="true">+</span>Create Asset
				</button>
				{visible.map((asset) => {
					const name = assetDisplayName(asset, project);
					const thumb = asset.thumbnailUrl ?? thumbnails[asset.url];
					return (
						<button
							type="button"
							className="creator-asset-card"
							aria-pressed={selected === asset.id}
							aria-label={name}
							key={asset.id}
							onClick={() => onSelect(asset)}
						>
							<div className="creator-thumb">
								{thumb ? <img src={thumb} alt="" /> : <span>GLB</span>}
							</div>
							<strong title={name}>{name}</strong>
							<small>
								{creatorCategory(asset)}
								{asset.variant ? " · Variant" : ""}
							</small>
						</button>
					);
				})}
			</div>
			{!visible.length && (
				<p className="creator-note">No assets match your search.</p>
			)}
			{visible.length < filtered.length && (
				<button
					type="button"
					className="creator-more"
					onClick={() => setLimit(limit + 16)}
				>
					Show more
				</button>
			)}
		</>
	);
}

function AnimationTimeline({
	clip,
	time,
	playing,
	speed,
	bone,
	onBone,
	rig,
	onSeek,
	onPlay,
	onSpeed,
}: {
	clip?: AnimationClip;
	time: number;
	playing: boolean;
	speed: number;
	bone: string;
	rig: PreviewRig;
	onBone: (bone: string) => void;
	onSeek: (time: number) => void;
	onPlay: () => void;
	onSpeed: (speed: number) => void;
}) {
	const track = getAssetCreatorBoneTrack(clip, bone);
	const editable = rig.bones.filter((entry) =>
		getAssetCreatorBoneTrack(clip, entry.name),
	);
	return (
		<div className="creator-timeline">
			<div className="creator-timeline-head">
				<strong>Clip timeline</strong>
				<button type="button" onClick={onPlay} disabled={!clip}>
					{playing ? "Pause preview" : "Play preview"}
				</button>
				<label>
					Speed{" "}
					<select
						value={speed}
						onChange={(event) => onSpeed(Number(event.target.value))}
					>
						<option value={0.25}>¼×</option>
						<option value={0.5}>½×</option>
						<option value={1}>1×</option>
						<option value={2}>2×</option>
					</select>
				</label>
				<span>
					{Math.min(time, clip?.duration ?? 0).toFixed(2)} /{" "}
					{(clip?.duration ?? 0).toFixed(2)} s
				</span>
			</div>
			<input
				type="range"
				aria-label="Playhead"
				min={0}
				max={clip?.duration ?? 0}
				step={0.001}
				disabled={!clip}
				value={Math.min(time, clip?.duration ?? 0)}
				onChange={(event) => onSeek(event.target.valueAsNumber)}
			/>
			<div className="creator-track">
				<select
					aria-label="Bone track"
					value={editable.some((entry) => entry.name === bone) ? bone : ""}
					onChange={(event) => onBone(event.target.value)}
					disabled={!editable.length}
				>
					<option value="">Select a bone track</option>
					{editable.map((entry) => (
						<option key={entry.name} value={entry.name}>
							{entry.name}
						</option>
					))}
				</select>
				<div className="creator-keybar" aria-hidden="true">
					{clip &&
						track &&
						Array.from(track.times)
							.filter(
								(_, index) => index % Math.ceil(track.times.length / 150) === 0,
							)
							.map((key) => (
								<i
									key={key}
									style={{ left: `${(key / clip.duration) * 100}%` }}
								/>
							))}
				</div>
				<small>
					{track
						? `${track.times.length} keys`
						: `${clip?.tracks.length ?? 0} tracks`}
				</small>
			</div>
		</div>
	);
}

export function AssetCreatorWorkspace({
	project,
	visible,
	saveProject,
	onImported,
	onDraftChange,
}: {
	project: GameProject;
	visible: boolean;
	saveProject: () => boolean;
	onImported: () => void;
	onDraftChange: (dirty: boolean) => void;
}) {
	const library = project.assetCreator ?? EMPTY_LIBRARY;
	const registry = useMemo(
		() => listThreeVisualAssets(project.characterAssets, library.variants),
		[library.variants, project.characterAssets],
	);
	const assets = useMemo(
		() =>
			registry.filter(
				(asset) => !asset.animationOnly && !asset.hiddenFromBrowser,
			),
		[registry],
	);
	const effects = useMemo(
		() => [
			...STANDARD_EFFECTS,
			...library.effects.filter(
				(effect) => !STANDARD_EFFECTS.some((base) => base.id === effect.id),
			),
		],
		[library.effects],
	);
	const [tab, setTab] = useState<Tab>("Assets");
	const [assetId, setAssetId] = useState(
		() =>
			project.npcs.find((npc) => npc.name.toLowerCase().includes("oswin"))
				?.threeVisual?.assetId ?? "",
	);
	const [assetEdit, setAssetEdit] = useState<AssetCreatorVariant>();
	const [rig, setRig] = useState<PreviewRig>(EMPTY_PREVIEW_RIG);
	const [bone, setBone] = useState("");
	const [settings, setSettings] = useState(initialPreviewSettings);
	const [clipId, setClipId] = useState("");
	const [showAll, setShowAll] = useState(false);
	const [clipEdit, setClipEdit] = useState<AssetCreatorClip>();
	const [rotationEdit, setRotationEdit] = useState<typeof ZERO_ASSET_VECTOR>();
	const [effectId, setEffectId] = useState(STANDARD_EFFECTS[0].id);
	const [effectEdit, setEffectEdit] = useState<AssetCreatorEffect>();
	const [effectRestart, setEffectRestart] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [speed, setSpeed] = useState(1);
	const [time, setTime] = useState(0);
	const [seek, setSeek] = useState({ time: 0, revision: 0 });
	const [modal, setModal] = useState<Modal>();
	const [message, setMessage] = useState("");

	const asset = assets.find((entry) => entry.id === assetId) ?? assets[0];
	const base =
		registry.find((entry) => entry.id === asset?.variant?.baseAssetId) ?? asset;
	const assetName = asset ? assetDisplayName(asset, project) : "";
	const assetBase =
		asset &&
		(asset.variant ??
			assetCreatorVariantDraft(asset.id, assetName, creatorCategory(asset)));
	const draft = assetEdit ?? assetBase;
	const assetDirty = isDirty(assetBase, assetEdit);
	const props = assets.filter(
		(entry) =>
			entry.id !== asset?.id &&
			creatorCategory(entry) === "Props" &&
			entry.category !== "character",
	);
	const prop = props.find((entry) => entry.id === draft?.attachment?.assetId);

	const clips = useAssetCreatorClips(
		visible ? base : undefined,
		registry,
		library.clips,
		rig.nodes,
		showAll,
	);
	const selectedClip =
		clips.find((clip) => clip.id === clipId) ??
		(clipId
			? undefined
			: (clips.find(
					(clip) => clip.name === "Idle" && clip.status === "ready",
				) ?? clips.find((clip) => clip.status === "ready")));
	const clipBase = useMemo<AssetCreatorClip | undefined>(
		() =>
			selectedClip?.variant ??
			(selectedClip
				? {
						id: selectedClip.id,
						name: selectedClip.name,
						sourceAssetId: selectedClip.sourceAssetId,
						sourceClipName: selectedClip.sourceClipName,
						loop: selectedClip.loop,
						keys: [],
					}
				: undefined),
		[selectedClip],
	);
	const clipDraft = clipEdit ?? clipBase;
	const source = useAssetCreatorClip(
		visible ? base : undefined,
		registry,
		visible ? selectedClip : undefined,
		rig.nodes,
	);
	const clip = useMemo(
		() =>
			source.clip && clipEdit
				? applyAssetCreatorClipEdits(source.clip, clipEdit)
				: source.clip,
		[source.clip, clipEdit],
	);
	const clipDirty = isDirty(clipBase, clipEdit);
	const clipTrack = getAssetCreatorBoneTrack(clip, bone);
	const atEnd = Boolean(clip && time >= clip.duration);
	const isPlaying = playing && (clipDraft?.loop !== false || !atEnd);

	const effectBase =
		effects.find((effect) => effect.id === effectId) ?? effects[0];
	const effectDraft = effectEdit ?? effectBase;
	const effectDirty = isDirty(effectBase, effectEdit);
	const previewEffect =
		tab === "Effects"
			? effectDraft
			: effects.find((effect) => effect.id === draft?.effectId);
	const dirty = assetDirty || clipDirty || effectDirty;
	useEffect(() => {
		onDraftChange(dirty);
		return () => onDraftChange(false);
	}, [dirty, onDraftChange]);

	function commit(
		update: (current: AssetCreatorLibrary) => AssetCreatorLibrary,
		name: string,
	) {
		useProjectStore.getState().updateProject((next) => {
			next.assetCreator = update(next.assetCreator ?? EMPTY_LIBRARY);
		});
		setMessage(
			saveProject()
				? `Saved ${name}.`
				: "Changes are in the current project. Browser storage could not be written.",
		);
		setModal(undefined);
	}

	function selectAsset(next: ThreeVisualAssetDefinition) {
		if (asset?.id === next.id) return;
		if (
			(assetDirty || clipDirty) &&
			!window.confirm("Discard the unsaved asset and clip changes?")
		)
			return;
		resetAssetSelection(next);
	}

	function resetAssetSelection(next: ThreeVisualAssetDefinition) {
		setAssetId(next.id);
		setAssetEdit(undefined);
		setClipId("");
		setClipEdit(undefined);
		setRotationEdit(undefined);
		if ((next.variant?.baseAssetId ?? next.id) !== base?.id)
			setRig(EMPTY_PREVIEW_RIG);
		setBone("");
		setTime(0);
		setSeek((previous) => ({ time: 0, revision: previous.revision + 1 }));
		setPlaying(true);
		setMessage("");
	}

	function saveAsset(next: AssetCreatorVariant) {
		commit(
			(current) => ({
				...current,
				variants: upsertAssetCreatorEntry(current.variants, {
					...next,
					name: next.name.trim(),
				}),
			}),
			next.name,
		);
		setAssetId(next.id);
		setAssetEdit(undefined);
	}

	function saveClip(next: AssetCreatorClip) {
		commit(
			(current) => ({
				...current,
				clips: upsertAssetCreatorEntry(current.clips, {
					...next,
					name: next.name.trim(),
				}),
			}),
			next.name,
		);
		setClipId(next.id);
		setClipEdit(undefined);
	}

	function saveEffect(next: AssetCreatorEffect) {
		commit(
			(current) => ({
				...current,
				effects: upsertAssetCreatorEntry(current.effects, {
					...next,
					name: next.name.trim(),
				}),
			}),
			next.name,
		);
		setEffectId(next.id);
		setEffectEdit(undefined);
	}

	function selectBone(next: string) {
		setBone(next);
		setRotationEdit(undefined);
	}

	function seekTo(next: number) {
		setPlaying(false);
		setTime(next);
		setRotationEdit(undefined);
		setSeek((previous) => ({ time: next, revision: previous.revision + 1 }));
	}

	function updateEffect(patch: Partial<AssetCreatorEffect>) {
		setEffectEdit({ ...effectDraft, ...patch });
	}

	return (
		<main
			className="project-asset-workspace"
			hidden={!visible}
			aria-labelledby={visible ? "editor-route-heading" : undefined}
		>
			<h1
				id={visible ? "editor-route-heading" : undefined}
				className="project-route-title"
				tabIndex={-1}
			>
				Asset Creator
			</h1>
			<div className="creator-workspace">
				<aside className="creator-panel creator-library">
					{visible && tab === "Assets" && (
						<AssetLibrary
							assets={assets}
							project={project}
							selected={asset?.id ?? ""}
							onSelect={selectAsset}
							onCreate={() => setModal("create")}
						/>
					)}
					{visible && tab === "Animations" && (
						<>
							<PanelHead title="Animation Library">
								{assetName} · rig compatibility
							</PanelHead>
							<div className="creator-fields">
								<label>
									Show clips
									<select
										value={showAll ? "all" : "compatible"}
										onChange={(event) =>
											setShowAll(event.target.value === "all")
										}
									>
										<option value="compatible">Compatible clips</option>
										<option value="all">All clips</option>
									</select>
								</label>
								{!clips.length && (
									<small>
										{rig.nodes.length
											? "No compatible clips were found."
											: "Inspecting the selected model…"}
									</small>
								)}
								{clips.map((entry) => (
									<button
										type="button"
										className="creator-resource"
										key={entry.id}
										aria-pressed={entry.id === selectedClip?.id}
										onClick={() => {
											if (
												clipDirty &&
												!window.confirm("Discard the unsaved clip changes?")
											)
												return;
											setClipId(entry.id);
											setClipEdit(undefined);
											setRotationEdit(undefined);
											setTime(0);
											setPlaying(true);
											setSeek((current) => ({
												time: 0,
												revision: current.revision + 1,
											}));
											setMessage("");
										}}
									>
										<strong>{entry.name}</strong>
										<small>
											{entry.variant ? "Saved variant" : entry.sourceName} ·{" "}
											{entry.status === "ready"
												? `${entry.duration?.toFixed(2)} s`
												: entry.status}
										</small>
									</button>
								))}
							</div>
						</>
					)}
					{visible && tab === "Effects" && (
						<>
							<PanelHead title="Effects Library">
								Preview effects for {assetName}
							</PanelHead>
							<div className="creator-fields">
								{effects.map((entry) => (
									<button
										type="button"
										className="creator-resource"
										key={entry.id}
										aria-pressed={entry.id === effectId}
										onClick={() => {
											if (
												effectDirty &&
												!window.confirm("Discard the unsaved effect changes?")
											)
												return;
											setEffectId(entry.id);
											setEffectEdit(undefined);
											setEffectRestart((value) => value + 1);
											setMessage("");
										}}
									>
										<strong>{entry.name}</strong>
										<small>{entry.type}</small>
									</button>
								))}
							</div>
						</>
					)}
				</aside>
				<section
					className="creator-middle"
					aria-label="Asset preview workspace"
				>
					<nav className="creator-tabs" aria-label="Asset Creator views">
						{TABS.map((name) => (
							<button
								type="button"
								key={name}
								aria-pressed={name === tab}
								onClick={() => setTab(name)}
							>
								{name}
							</button>
						))}
						<div className="creator-studio">
							<AssetCreatorLauncher
								buttonLabel="Blender Studio"
								onImported={onImported}
							/>
						</div>
					</nav>
					{visible && base && draft && (
						<AssetPreview
							asset={base}
							draft={draft}
							settings={settings}
							bone={bone}
							onRig={setRig}
							onBone={selectBone}
							clip={clip}
							playing={isPlaying}
							speed={speed}
							loop={clipDraft?.loop ?? true}
							seek={seek}
							onTime={setTime}
							prop={prop}
							effect={previewEffect}
							effectRestart={effectRestart}
						/>
					)}
					{visible && tab === "Animations" && (
						<AnimationTimeline
							clip={clip}
							time={time}
							playing={isPlaying}
							speed={speed}
							bone={bone}
							rig={rig}
							onBone={selectBone}
							onSeek={seekTo}
							onPlay={() => {
								setRotationEdit(undefined);
								if (!isPlaying && atEnd) seekTo(0);
								setPlaying(!isPlaying);
							}}
							onSpeed={setSpeed}
						/>
					)}
					{visible && (
						<PreviewToolbar settings={settings} onChange={setSettings} />
					)}
				</section>
				<aside
					className="creator-panel creator-inspector"
					aria-label="Asset Creator inspector"
				>
					{visible && tab === "Assets" && draft && base && (
						<>
							<PanelHead title="Asset Properties">
								{draft.name} · {draft.category}
							</PanelHead>
							<div className="creator-inspector-save">
								<SaveControls
									canSave={Boolean(asset?.variant && draft.name.trim())}
									canFork={Boolean(draft.name.trim())}
									dirty={assetDirty}
									onSave={() => saveAsset(draft)}
									onFork={() => setModal("asset")}
									onRevert={() => {
										setAssetEdit(undefined);
										setMessage("");
									}}
								/>
								<small>
									{assetDirty ? "Unsaved asset changes. " : ""}
									{asset?.variant
										? `Variant of ${base.name}`
										: "Shared archetype. Save as New to keep edits."}
								</small>
							</div>
							<AssetFields
								draft={draft}
								rig={rig}
								bone={bone}
								setBone={selectBone}
								props={props}
								effects={effects.filter(
									(effect) => !effect.id.startsWith("builtin-"),
								)}
								onChange={(patch) => setAssetEdit({ ...draft, ...patch })}
							/>
							<div className="creator-fields creator-source">
								<h4>Source</h4>
								<small title={base.url}>{base.name} · GLB</small>
								<small>
									{draft.constraint}
									{draft.referenceImages.length
										? ` · ${draft.referenceImages.length} reference images`
										: ""}
								</small>
							</div>
						</>
					)}
					{visible && tab === "Animations" && (
						<>
							<PanelHead title="Clip Inspector">
								{selectedClip?.name ?? "Select an animation"}
							</PanelHead>
							{clipDraft && (
								<>
									<div className="creator-inspector-save">
										<SaveControls
											canSave={Boolean(
												selectedClip?.variant && clipDraft.name.trim(),
											)}
											canFork={Boolean(clip && clipDraft.name.trim())}
											dirty={clipDirty}
											onSave={() => saveClip(clipDraft)}
											onFork={() => setModal("clip")}
											onRevert={() => {
												setClipEdit(undefined);
												setRotationEdit(undefined);
												setMessage("");
											}}
										/>
										<small>
											{clipDirty
												? "Unsaved clip changes"
												: selectedClip?.variant
													? "Saved clip variant"
													: "Source clip. Save as New to keep edits."}
										</small>
									</div>
									<div className="creator-fields">
										<label>
											Clip name
											<input
												value={clipDraft.name}
												onChange={(event) =>
													setClipEdit({
														...clipDraft,
														name: event.target.value,
													})
												}
											/>
										</label>
										<label>
											Loop mode
											<select
												value={clipDraft.loop ? "loop" : "once"}
												onChange={(event) =>
													setClipEdit({
														...clipDraft,
														loop: event.target.value === "loop",
													})
												}
											>
												<option value="loop">Loop</option>
												<option value="once">Once</option>
											</select>
										</label>
										<small>
											Rig ·{" "}
											{source.status === "ready"
												? `Compatible with ${assetName}`
												: source.status}
										</small>
										<small>
											Source · {selectedClip?.sourceName} /{" "}
											{clipDraft.sourceClipName}
										</small>
										{clip && clipTrack && (
											<>
												<h4>
													{bone} <small>Local keyframe</small>
												</h4>
												<VectorFields
													label="Keyframe rotation (°)"
													value={
														rotationEdit ??
														readAssetCreatorRotation(clip, bone, time) ??
														ZERO_ASSET_VECTOR
													}
													onChange={(rotation) => {
														setPlaying(false);
														setRotationEdit(rotation);
													}}
												/>
												<button
													type="button"
													onClick={() => {
														const rotation =
															rotationEdit ??
															readAssetCreatorRotation(clip, bone, time);
														if (!rotation) return;
														setClipEdit({
															...clipDraft,
															keys: upsertAssetCreatorKey(clipDraft.keys, {
																bone,
																time,
																rotation,
															}),
														});
														seekTo(time);
													}}
												>
													Add Keyframe
												</button>
												<small>{clipDraft.keys.length} authored keys</small>
											</>
										)}
										{clip && !clipTrack && (
											<small>
												Select a bone track in the timeline to edit its local
												rotation.
											</small>
										)}
									</div>
								</>
							)}
						</>
					)}
					{visible && tab === "Effects" && (
						<>
							<PanelHead title="Effect Properties">
								{effectDraft.name} · preview only
							</PanelHead>
							<div className="creator-inspector-save">
								<SaveControls
									canSave={Boolean(
										library.effects.some((effect) => effect.id === effectId) &&
											effectDraft.name.trim(),
									)}
									canFork={Boolean(effectDraft.name.trim())}
									dirty={effectDirty}
									onSave={() => saveEffect(effectDraft)}
									onFork={() => setModal("effect")}
									onRevert={() => {
										setEffectEdit(undefined);
										setMessage("");
									}}
								/>
								<small>
									{effectDirty
										? "Unsaved effect changes"
										: "Reusable preview effect"}
								</small>
							</div>
							<div className="creator-fields">
								<label>
									Effect name
									<input
										value={effectDraft.name}
										onChange={(event) =>
											updateEffect({ name: event.target.value })
										}
									/>
								</label>
								<label>
									Effect type
									<select
										value={effectDraft.type}
										onChange={(event) =>
											updateEffect({
												type: event.target.value as AssetCreatorEffect["type"],
											})
										}
									>
										<option value="glow">Glow</option>
										<option value="fog">Fog</option>
										<option value="embers">Embers</option>
									</select>
								</label>
								<label>
									Colour
									<input
										type="color"
										value={effectDraft.color}
										onChange={(event) =>
											updateEffect({ color: event.target.value })
										}
									/>
								</label>
								<NumberField
									label="Intensity"
									value={effectDraft.intensity}
									min={0}
									max={1}
									step={0.05}
									onChange={(intensity) => updateEffect({ intensity })}
								/>
								<NumberField
									label="Duration (s)"
									value={effectDraft.duration}
									min={0.1}
									max={60}
									step={0.1}
									onChange={(duration) => updateEffect({ duration })}
								/>
								<label>
									Loop mode
									<select
										value={effectDraft.loop ? "loop" : "once"}
										onChange={(event) =>
											updateEffect({ loop: event.target.value === "loop" })
										}
									>
										<option value="loop">Loop</option>
										<option value="once">Once</option>
									</select>
								</label>
								<label>
									Attachment target
									<select
										value={effectDraft.socket ?? ""}
										onChange={(event) =>
											updateEffect({ socket: event.target.value || undefined })
										}
									>
										<option value="">Preview stage</option>
										{effectDraft.socket &&
											!rig.sockets.some(
												(socket) => socket.name === effectDraft.socket,
											) && (
												<option value={effectDraft.socket}>
													Unavailable socket
												</option>
											)}
										{rig.sockets.map((socket) => (
											<option key={socket.name} value={socket.name}>
												{socketLabel(socket.name)}
											</option>
										))}
									</select>
								</label>
								<button
									type="button"
									onClick={() => setEffectRestart((value) => value + 1)}
								>
									Replay effect
								</button>
							</div>
						</>
					)}
					{visible && message && (
						<p className="creator-note" role="status">
							{message}
						</p>
					)}
				</aside>
			</div>
			{visible && modal === "create" && asset && (
				<CreateAssetDialog
					assets={assets}
					current={asset}
					onClose={() => setModal(undefined)}
					onCreate={(sourceAsset, values) => {
						if (
							(assetDirty || clipDirty) &&
							!window.confirm("Discard the unsaved asset and clip changes?")
						)
							return;
						const sourceDraft =
							sourceAsset.variant ??
							assetCreatorVariantDraft(
								sourceAsset.id,
								sourceAsset.name,
								creatorCategory(sourceAsset),
							);
						if (asset.id !== sourceAsset.id) resetAssetSelection(sourceAsset);
						saveAsset({
							...sourceDraft,
							...values,
							id: newId("asset"),
							forkedFromId: sourceAsset.variant?.id,
						});
					}}
				/>
			)}
			{visible && modal === "asset" && draft && asset && (
				<NameResourceDialog
					title="Save asset as new"
					name={draft.name === assetName ? `${draft.name} Variant` : draft.name}
					onClose={() => setModal(undefined)}
					onSave={(name) =>
						saveAsset({
							...draft,
							id: newId("asset"),
							name,
							forkedFromId: asset.variant?.id,
						})
					}
				/>
			)}
			{visible && modal === "clip" && clipDraft && (
				<NameResourceDialog
					title="Save clip as new"
					name={
						clipDraft.name === clipBase?.name
							? `${clipDraft.name} Variant`
							: clipDraft.name
					}
					onClose={() => setModal(undefined)}
					onSave={(name) => saveClip({ ...clipDraft, id: newId("clip"), name })}
				/>
			)}
			{visible && modal === "effect" && (
				<NameResourceDialog
					title="Save effect as new"
					name={
						effectDraft.name === effectBase.name
							? `${effectDraft.name} Variant`
							: effectDraft.name
					}
					onClose={() => setModal(undefined)}
					onSave={(name) =>
						saveEffect({ ...effectDraft, id: newId("effect"), name })
					}
				/>
			)}
		</main>
	);
}
