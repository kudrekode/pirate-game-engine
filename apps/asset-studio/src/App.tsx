import {
	AUTHORED_BODY_PRESETS,
	AUTHORED_FACE_PRESETS,
	AUTHORED_HUMAN_CONTROLS,
	type AuthoredHumanValues,
	CHARACTER_HAIR_COMPONENT_IDS,
	CHARACTER_PALETTE_REGIONS,
	type CharacterBodyParameters,
	type CharacterHairComponentId,
	type CharacterPaletteRegion,
	type CharacterRecipeV1,
	CLOTHING_SLOTS,
	CLOTHING_SWATCHES,
	clothingIssues,
	createAuthoredHumanRecipe,
	createDefaultCharacterRecipe,
	everydayClothing,
	getCharacterComponentDefinition,
	matchingAuthoredPreset,
	noClothing,
	parseCharacterRecipe,
	sameCharacterGeometry,
	sameClothing,
	serializeCharacterRecipe,
} from "@adventure-game-builder/character-contract";
import {
	PROCEDURAL_MANNEQUIN_V0_ASSET,
	type ThreeVisualAssetDefinition,
} from "@adventure-game-builder/three-asset-preview";
import { useMemo, useRef, useState } from "react";
import { GameEngineNavigation } from "./GameEngineNavigation";
import { type CreatorCameraState, HumanoidPreview } from "./HumanoidPreview";
import {
	AUTHORED_HUMAN_FIXTURE_ID,
	GOLDEN_REFERENCE_FIXTURE_ID,
	PREVIEW_SOURCES,
	PROCEDURAL_MANNEQUIN_FIXTURE_ID,
	type PreviewSource,
	type PreviewSourceId,
} from "./previewSources";
import {
	PROCEDURAL_FACE_APPEARANCE,
	PROCEDURAL_FACE_FEATURE_VERSION,
	PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS,
	PROCEDURAL_MANNEQUIN_BODY_PARAMETERS,
	PROCEDURAL_SKIN_APPEARANCE,
	type ProceduralMannequinCompileResult,
	type ProceduralMannequinManifest,
	randomizeProceduralMannequinBody,
	requestProceduralMannequinCompile,
	validateProceduralMannequinAppearance,
	validateProceduralMannequinBody,
} from "./proceduralMannequinCreator";
import { UseInGame } from "./UseInGame";

const NAV_SECTIONS = [
	"Character",
	"Components",
	"Materials",
	"Animations",
	"Export",
] as const;
const CREATOR_SECTIONS = [
	"Character",
	"Body",
	"Face",
	"Hair",
	"Clothing",
	"Appearance",
] as const;
type CreatorSection = (typeof CREATOR_SECTIONS)[number];
const INITIAL_AUTHORED_RECIPE = createAuthoredHumanRecipe();

const BODY_BASE_OPTIONS = [
	{ label: "Humanoid default", value: "humanoid-default" },
	{ label: "Future athletic base", value: "humanoid-athletic-placeholder" },
	{ label: "Future compact base", value: "humanoid-compact-placeholder" },
] as const;

const HAIR_COMPONENT_OPTIONS = CHARACTER_HAIR_COMPONENT_IDS.map((id) => ({
	id,
	label:
		id === "none"
			? "No hair"
			: (getCharacterComponentDefinition(id)?.name ?? id),
}));

const PALETTE_LABELS: Record<CharacterPaletteRegion, string> = {
	skin: "Skin color",
	hair: "Hair color",
	primary: "Primary color",
	secondary: "Secondary color",
	metal: "Metal color",
};

const SKIN_COLOR_PRESETS = [
	{ color: "#f1c7a5", label: "Tone 1" },
	{ color: "#dca47d", label: "Tone 2" },
	{ color: "#c98f65", label: "Tone 3" },
	{ color: "#a96f4c", label: "Tone 4" },
	{ color: "#7d4f38", label: "Tone 5" },
	{ color: "#503126", label: "Tone 6" },
] as const;

const HAIR_COLOR_PRESETS = [
	{ color: "#3b2a1f", label: "Brown" },
	{ color: "#17191e", label: "Black" },
	{ color: "#bd955b", label: "Blond" },
	{ color: "#8b3f27", label: "Auburn" },
	{ color: "#a6a6ab", label: "Silver" },
] as const;

const EYE_COLOR_PRESETS = [
	{ color: "#30343b", label: "Charcoal" },
	{ color: "#4b5d67", label: "Slate" },
	{ color: "#5c4634", label: "Earth" },
	{ color: "#53624b", label: "Moss" },
	{ color: "#405c72", label: "Ocean" },
] as const;

function replaceHairComponent(
	recipe: CharacterRecipeV1,
	value: CharacterHairComponentId,
): CharacterRecipeV1 {
	return { ...recipe, components: { ...recipe.components, hair: value } };
}

function downloadRecipe(recipe: CharacterRecipeV1) {
	const fileName = `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "character"}.recipe.json`;
	const blob = new Blob([serializeCharacterRecipe(recipe)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

type RecentCompilation = {
	parameters: CharacterBodyParameters;
	recipe: CharacterRecipeV1;
	result: ProceduralMannequinCompileResult;
	seed: string;
	source: PreviewSource;
};
export default function App() {
	const [creatorSection, setCreatorSection] =
		useState<CreatorSection>("Character");
	const creatorCamera = useRef<CreatorCameraState>({
		preset: "three-quarter",
		manual: false,
	});
	const [resetCandidate, setResetCandidate] = useState<CharacterRecipeV1>();
	const [activeSection, setActiveSection] =
		useState<(typeof NAV_SECTIONS)[number]>("Character");
	const [recipe, setRecipe] = useState<CharacterRecipeV1>(() => {
		return new URLSearchParams(window.location.search).get("family") ===
			"legacy"
			? createDefaultCharacterRecipe()
			: createAuthoredHumanRecipe();
	});
	const [showDetails, setShowDetails] = useState(
		new URLSearchParams(window.location.search).get("family") === "legacy",
	);
	const isAuthored = recipe.geometry?.family === "authored-human";
	const [randomSeed, setRandomSeed] = useState("asset-studio-1");
	const [recentCompilations, setRecentCompilations] = useState<
		RecentCompilation[]
	>([]);
	const [loadStatus, setLoadStatus] = useState("");
	const [compileStatus, setCompileStatus] = useState<
		"idle" | "compiling" | "succeeded" | "failed"
	>("idle");
	const [compileError, setCompileError] = useState("");
	const [technicalDetails, setTechnicalDetails] = useState("");
	const [operation, setOperation] = useState<"preview" | "full">("preview");
	const [compileResult, setCompileResult] =
		useState<ProceduralMannequinCompileResult>();
	const [currentManifest, setCurrentManifest] =
		useState<ProceduralMannequinManifest>();
	const [compiledPreviewSource, setCompiledPreviewSource] =
		useState<PreviewSource>();
	const [previewSourceId, setPreviewSourceId] = useState<PreviewSourceId>(
		new URLSearchParams(window.location.search).get("family") === "legacy"
			? GOLDEN_REFERENCE_FIXTURE_ID
			: AUTHORED_HUMAN_FIXTURE_ID,
	);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const generationActive = useRef(false);

	const validation = useMemo(() => parseCharacterRecipe(recipe), [recipe]);
	const recipeJson = useMemo(() => JSON.stringify(recipe, null, 2), [recipe]);
	const bodyValidation = validateProceduralMannequinBody(
		recipe.body.parameters,
	);
	const appearanceValidation = validateProceduralMannequinAppearance(recipe);
	const previewSource =
		previewSourceId === compiledPreviewSource?.fixtureId &&
		compiledPreviewSource
			? compiledPreviewSource
			: PREVIEW_SOURCES[previewSourceId];
	const activeManifest = compileResult?.manifest ?? currentManifest;
	const draftHairComponent = getCharacterComponentDefinition(
		recipe.components.hair,
	);
	const matchingHairManifest =
		activeManifest?.components.hair.componentId === recipe.components.hair
			? activeManifest
			: undefined;
	const compileDirty = Boolean(
		(!activeManifest &&
			isAuthored &&
			(!sameClothing(recipe.clothing, INITIAL_AUTHORED_RECIPE.clothing) ||
				!sameCharacterGeometry(
					recipe.geometry,
					INITIAL_AUTHORED_RECIPE.geometry,
				) ||
				recipe.body.parameters.height !==
					INITIAL_AUTHORED_RECIPE.body.parameters.height ||
				recipe.components.hair !== INITIAL_AUTHORED_RECIPE.components.hair ||
				recipe.palette.hair.toLowerCase() !==
					INITIAL_AUTHORED_RECIPE.palette.hair ||
				recipe.palette.skin.toLowerCase() !==
					INITIAL_AUTHORED_RECIPE.palette.skin ||
				recipe.appearance.skin.roughness !==
					INITIAL_AUTHORED_RECIPE.appearance.skin.roughness)) ||
			(activeManifest &&
				(!sameClothing(recipe.clothing, activeManifest.clothing) ||
					!PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS.every(
						(key) =>
							activeManifest.proportions[key] === recipe.body.parameters[key],
					) ||
					activeManifest.appearance.skin.authoredColor !==
						recipe.palette.skin.toLowerCase() ||
					activeManifest.appearance.skin.authoredRoughness !==
						recipe.appearance.skin.roughness ||
					activeManifest.appearance.hair.authoredColor !==
						recipe.palette.hair.toLowerCase() ||
					(!isAuthored &&
						activeManifest.appearance.face.authoredEyeColor !==
							recipe.appearance.face.eyeColor.toLowerCase()) ||
					!sameCharacterGeometry(
						activeManifest.geometrySource,
						recipe.geometry,
					) ||
					activeManifest.components.hair.componentId !==
						recipe.components.hair)),
	);

	function updateRecipe(
		updater: (current: CharacterRecipeV1) => CharacterRecipeV1,
	) {
		setRecipe((current) => updater(current));
		setLoadStatus("");
	}

	function openRecipe(nextRecipe: CharacterRecipeV1) {
		setResetCandidate(undefined);
		setRecipe(nextRecipe);
		setActiveSection("Character");
		setCreatorSection("Character");
		creatorCamera.current = { preset: "three-quarter", manual: false };
		setLoadStatus("");
		setCompileError("");
		setCompileResult(undefined);
		setCompiledPreviewSource(undefined);
		setCurrentManifest(undefined);
		setCompileStatus("idle");
		setPreviewSourceId(
			nextRecipe.geometry?.family === "authored-human"
				? AUTHORED_HUMAN_FIXTURE_ID
				: PROCEDURAL_MANNEQUIN_FIXTURE_ID,
		);
	}
	function chooseFamily(authored: boolean) {
		openRecipe(
			authored ? createAuthoredHumanRecipe() : createDefaultCharacterRecipe(),
		);
	}
	function applyIdentity(values: Partial<AuthoredHumanValues>) {
		updateRecipe((current) =>
			current.geometry?.family === "authored-human"
				? {
						...current,
						geometry: {
							...current.geometry,
							values: { ...current.geometry.values, ...values },
						},
					}
				: current,
		);
	}
	function resetSection() {
		const defaults = createAuthoredHumanRecipe();
		if (defaults.geometry?.family !== "authored-human") return;
		if (creatorSection === "Body" || creatorSection === "Face") {
			const section = creatorSection;
			applyIdentity(
				Object.fromEntries(
					Object.entries(AUTHORED_HUMAN_CONTROLS)
						.filter(([, control]) => control.section === section)
						.map(([key]) => [key, 0]),
				),
			);
			if (section === "Body")
				updateBodyParameter("height", defaults.body.parameters.height);
		} else if (creatorSection === "Hair") {
			updateRecipe((current) => ({
				...replaceHairComponent(current, "quaternius-hair-v0"),
				palette: { ...current.palette, hair: defaults.palette.hair },
			}));
		} else if (creatorSection === "Clothing") {
			updateRecipe((current) => ({ ...current, clothing: everydayClothing() }));
		} else if (creatorSection === "Appearance") {
			updateRecipe((current) => ({
				...current,
				palette: { ...current.palette, skin: defaults.palette.skin },
				appearance: { ...current.appearance, skin: defaults.appearance.skin },
			}));
		}
	}
	function presetCards(section: "Body" | "Face") {
		if (recipe.geometry?.family !== "authored-human") return null;
		const presets: ReadonlyArray<{
			id: string;
			name: string;
			description: string;
			values: Partial<AuthoredHumanValues>;
		}> = section === "Body" ? AUTHORED_BODY_PRESETS : AUTHORED_FACE_PRESETS;
		const selected = matchingAuthoredPreset(recipe.geometry.values, presets);
		return (
			<>
				<p className="preset-selection">
					<strong>{selected?.name ?? "Custom"}</strong>{" "}
					<span>· {section === "Body" ? "body" : "face"}</span>
				</p>
				<fieldset
					className={`preset-grid ${section.toLowerCase()}-presets`}
					aria-label={`${section} presets`}
				>
					{presets.map((preset) => (
						<button
							type="button"
							key={preset.id}
							aria-label={`${preset.name} ${section.toLowerCase()} preset`}
							aria-pressed={selected?.id === preset.id}
							onClick={() => applyIdentity(preset.values)}
						>
							<img
								src={`/assets/creator-presets/${section.toLowerCase()}-${preset.id}.jpg`}
								alt=""
							/>
							<strong>{preset.name}</strong>
							<span>{preset.description}</span>
						</button>
					))}
				</fieldset>
			</>
		);
	}
	function identityControls(section: "Body" | "Face") {
		if (recipe.geometry?.family !== "authored-human") return null;
		const values = recipe.geometry.values;
		return Object.entries(AUTHORED_HUMAN_CONTROLS)
			.filter(([, control]) => control.section === section)
			.map(([name, control]) => {
				const key = name as keyof AuthoredHumanValues;
				return (
					<label key={name}>
						{control.label}
						<input
							aria-label={control.label}
							type="range"
							min={control.min}
							max={control.max}
							step={0.01}
							value={values[key]}
							onChange={(event) => {
								const value = Number(event.target.value);
								updateRecipe((current) =>
									current.geometry?.family === "authored-human"
										? {
												...current,
												geometry: {
													...current.geometry,
													values: { ...current.geometry.values, [key]: value },
												},
											}
										: current,
								);
							}}
						/>
						<output>{values[key].toFixed(2)}</output>
					</label>
				);
			});
	}

	function updateBodyParameter(
		key: keyof CharacterBodyParameters,
		value: number,
	) {
		updateRecipe((current) => ({
			...current,
			body: {
				...current.body,
				parameters: {
					...current.body.parameters,
					[key]: value,
				},
			},
		}));
	}

	function handleRandomise() {
		const parameters = randomizeProceduralMannequinBody(randomSeed);
		updateRecipe((current) => ({
			...current,
			body: { ...current.body, parameters },
		}));
		if (!generationActive.current) setCompileStatus("idle");
		setCompileError("");
	}

	function selectRecentCompilation(compilation: RecentCompilation) {
		setResetCandidate(undefined);
		if (generationActive.current) return;
		setRecipe({
			...compilation.recipe,
			body: {
				...compilation.recipe.body,
				parameters: { ...compilation.recipe.body.parameters },
			},
			components: { ...compilation.recipe.components },
			palette: { ...compilation.recipe.palette },
			appearance: {
				face: { ...compilation.recipe.appearance.face },
				skin: { ...compilation.recipe.appearance.skin },
			},
		});
		setRandomSeed(compilation.seed);
		setOperation(
			compilation.result.manifest.validationLevel === "preview"
				? "preview"
				: "full",
		);
		setTechnicalDetails("");
		setCompileResult(compilation.result);
		setCurrentManifest(compilation.result.manifest);
		setCompiledPreviewSource(compilation.source);
		setPreviewSourceId(compilation.source.fixtureId as PreviewSourceId);
		setCompileStatus("succeeded");
		setCompileError("");
	}

	async function handleCompile(mode: "preview" | "full" = "preview") {
		if (
			!validation.ok ||
			!bodyValidation.ok ||
			!appearanceValidation.ok ||
			generationActive.current
		)
			return;
		generationActive.current = true;
		setOperation(mode);
		setTechnicalDetails("");
		setCompileStatus("compiling");
		setCompileError("");
		try {
			const result = await requestProceduralMannequinCompile(
				recipe,
				fetch,
				mode,
			);
			const definition: ThreeVisualAssetDefinition = {
				...PROCEDURAL_MANNEQUIN_V0_ASSET,
				id: `procedural-mannequin-creator-${result.requestId}`,
				name: `${isAuthored ? "Authored Human" : "Procedural Mannequin"} ${result.manifest.heightMetres.toFixed(2)} m`,
				url: result.assetUrl,
			};
			const source: PreviewSource = {
				artifactUrl: result.assetUrl,
				definition,
				description: `Locally compiled ${result.manifest.heightMetres.toFixed(2)} m creator artifact`,
				displayName: isAuthored ? "Authored Human" : "Procedural Mannequin V1",
				fixtureId: isAuthored
					? AUTHORED_HUMAN_FIXTURE_ID
					: PROCEDURAL_MANNEQUIN_FIXTURE_ID,
				authoredHuman: isAuthored,
				kindLabel: "Creator compile",
				manifestUrl: result.manifestUrl,
				mannequin: true,
				revision: result.requestId,
				transient: true,
			};
			const compilation = {
				parameters: { ...recipe.body.parameters },
				recipe: {
					...recipe,
					body: {
						...recipe.body,
						parameters: { ...recipe.body.parameters },
					},
					components: { ...recipe.components },
					palette: { ...recipe.palette },
					appearance: {
						face: { ...recipe.appearance.face },
						skin: { ...recipe.appearance.skin },
					},
				},
				result,
				seed: randomSeed,
				source,
			};
			setCompileResult(result);
			setCurrentManifest(result.manifest);
			setCompiledPreviewSource(source);
			setRecentCompilations((current) =>
				[
					compilation,
					...current.filter(
						(entry) => entry.result.requestId !== result.requestId,
					),
				].slice(0, 10),
			);
			setPreviewSourceId(source.fixtureId as PreviewSourceId);
			setCompileStatus("succeeded");
		} catch (error) {
			setTechnicalDetails(
				error instanceof Error
					? String(
							(error as Error & { technicalDetails?: string })
								.technicalDetails ?? error.message,
						)
					: String(error),
			);
			setCompileError(
				error instanceof Error &&
					error.message.startsWith("Character generation failed")
					? error.message
					: "Character generation failed. Check the technical details and try again.",
			);
			setCompileStatus("failed");
		} finally {
			generationActive.current = false;
		}
	}

	function handleLoadRecipe(event: React.ChangeEvent<HTMLInputElement>) {
		if (generationActive.current) return;
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		file
			.text()
			.then((raw) => {
				if (generationActive.current) return;
				const parsed = parseCharacterRecipe(JSON.parse(raw));
				if (!parsed.ok) {
					setLoadStatus(
						`Recipe rejected: ${parsed.issues[0]?.message ?? "Invalid recipe."}`,
					);
					return;
				}
				openRecipe(parsed.value);
				setLoadStatus(
					`Loaded ${file.name}. Generate Preview to view your saved values.`,
				);
			})
			.catch((error) => {
				setLoadStatus(
					error instanceof Error ? error.message : "Could not load recipe.",
				);
			})
			.finally(() => {
				event.target.value = "";
			});
	}

	return (
		<div className={`asset-studio-shell ${isAuthored ? "human-creator" : ""}`}>
			<header className="top-bar">
				<GameEngineNavigation />
				<div className="brand-lockup">
					<span className="brand-mark">AS</span>
					<div>
						<strong>{isAuthored ? "Character Creator" : "Asset Studio"}</strong>
						<span>
							{isAuthored ? "Make someone new" : "Character recipe foundation"}
						</span>
					</div>
				</div>
				<nav
					aria-label="Asset Studio sections"
					className="top-nav"
					hidden={isAuthored}
				>
					{NAV_SECTIONS.filter(
						(section) => !isAuthored || section === "Character",
					).map((section) => (
						<button
							className={section === activeSection ? "active" : ""}
							key={section}
							onClick={() => setActiveSection(section)}
							type="button"
						>
							{section}
						</button>
					))}
				</nav>
				<div className="top-actions">
					<button
						type="button"
						onClick={() => setShowDetails((value) => !value)}
						aria-pressed={showDetails}
					>
						Recipe details
					</button>
					<button
						disabled={!validation.ok}
						onClick={() => downloadRecipe(recipe)}
						type="button"
					>
						{isAuthored ? "Save character" : "Save Recipe JSON"}
					</button>
					<button
						disabled={compileStatus === "compiling"}
						onClick={() => fileInputRef.current?.click()}
						type="button"
					>
						{isAuthored ? "Open character" : "Load Recipe JSON"}
					</button>
					<input
						accept="application/json"
						hidden
						onChange={handleLoadRecipe}
						ref={fileInputRef}
						type="file"
					/>
				</div>
			</header>

			{activeSection === "Character" ? (
				<main
					className={`workspace ${showDetails ? "with-details" : "creator-workspace"}`}
				>
					<aside className="panel creation-panel">
						{isAuthored && (
							<nav
								className="creator-categories"
								aria-label="Character categories"
							>
								{CREATOR_SECTIONS.map((section) => (
									<button
										type="button"
										key={section}
										aria-pressed={section === creatorSection}
										onClick={() => setCreatorSection(section)}
									>
										{section}
									</button>
								))}
							</nav>
						)}
						<h1>{isAuthored ? creatorSection : "Character"}</h1>
						{loadStatus ? (
							<p className="load-status" role="status">
								{loadStatus}
							</p>
						) : null}
						<label hidden={isAuthored && !showDetails}>
							Character type
							<select
								aria-label="Character type"
								disabled={compileStatus === "compiling"}
								value={isAuthored ? "authored" : "legacy"}
								onChange={(e) => chooseFamily(e.target.value === "authored")}
							>
								<option value="authored">Authored Human · Experimental</option>
								<option value="legacy">Legacy Procedural Mannequin</option>
							</select>
						</label>
						<button
							type="button"
							disabled={compileStatus === "compiling"}
							hidden={isAuthored && creatorSection !== "Character"}
							onClick={() => {
								chooseFamily(isAuthored);
								setResetCandidate(recipe);
							}}
						>
							Reset character
						</button>
						<label hidden={isAuthored && creatorSection !== "Character"}>
							{isAuthored ? "Character name" : "Recipe name"}
							<input
								onChange={(event) =>
									updateRecipe((current) => ({
										...current,
										name: event.target.value,
									}))
								}
								value={recipe.name}
							/>
						</label>

						{isAuthored ? (
							<>
								{creatorSection === "Character" && (
									<>
										<p className="creator-intro">
											A face. A silhouette. A character of your own.
										</p>
										<p className="creator-note">
											Start with a body, choose a face, then make it yours.
										</p>
										<div className="start-choices">
											<button
												type="button"
												onClick={() => setCreatorSection("Body")}
											>
												Choose a body →
											</button>
											<button
												type="button"
												onClick={() => setCreatorSection("Face")}
											>
												Choose a face →
											</button>
										</div>
										<p className="creator-note">
											This first collection uses one masculine base with three
											builds and five faces.
										</p>
										{resetCandidate && (
											<button
												type="button"
												onClick={() => {
													openRecipe(resetCandidate);
													setResetCandidate(undefined);
												}}
											>
												Undo character reset
											</button>
										)}
										{recentCompilations.length > 0 && (
											<details className="recent-results">
												<summary>Recent results · this session</summary>
												{recentCompilations.map((entry, index) => (
													<button
														key={entry.result.requestId}
														type="button"
														disabled={compileStatus === "compiling"}
														onClick={() => selectRecentCompilation(entry)}
													>
														{recentCompilations.length - index}.{" "}
														{entry.recipe.name} ·{" "}
														{entry.result.manifest.validationLevel === "preview"
															? "Preview"
															: "Finalised"}
													</button>
												))}
											</details>
										)}
									</>
								)}
								{creatorSection === "Body" && (
									<>
										{presetCards("Body")}
										<p className="creator-note">
											All builds keep your chosen height. This base retains
											defined muscles.
										</p>
										<div className="section-heading">Make it yours</div>
										<label>
											Height
											<input
												aria-label="Height"
												type="range"
												min={1.5}
												max={2.1}
												step={0.01}
												value={recipe.body.parameters.height}
												onChange={(e) =>
													updateBodyParameter("height", Number(e.target.value))
												}
											/>
											<output>
												{recipe.body.parameters.height.toFixed(2)} m
											</output>
										</label>
										{identityControls("Body")}
									</>
								)}
								{creatorSection === "Face" && (
									<>
										{presetCards("Face")}
										<div className="section-heading">Make it yours</div>
										{identityControls("Face")}
									</>
								)}
								{creatorSection === "Hair" && (
									<>
										<p className="creator-note">
											Pick a style, then choose its colour.
										</p>
										<fieldset
											className="preset-grid hair-presets"
											aria-label="Hairstyle"
										>
											{[
												{
													id: "quaternius-hair-v0",
													name: "Short hair",
													image: "short",
												},
												{ id: "none", name: "No hair", image: "none" },
											].map((hair) => (
												<button
													type="button"
													key={hair.id}
													aria-pressed={recipe.components.hair === hair.id}
													onClick={() =>
														updateRecipe((current) =>
															replaceHairComponent(
																current,
																hair.id as CharacterHairComponentId,
															),
														)
													}
												>
													<img
														src={`/assets/creator-presets/hair-${hair.image}.jpg`}
														alt=""
													/>
													<strong>{hair.name}</strong>
												</button>
											))}
										</fieldset>
										<fieldset className="skin-presets">
											<legend>Hair colour</legend>
											{HAIR_COLOR_PRESETS.map((preset) => (
												<button
													type="button"
													key={preset.color}
													aria-label={`${preset.label} hair`}
													aria-pressed={recipe.palette.hair === preset.color}
													style={{ backgroundColor: preset.color }}
													onClick={() =>
														updateRecipe((current) => ({
															...current,
															palette: {
																...current.palette,
																hair: preset.color,
															},
														}))
													}
												/>
											))}
										</fieldset>
										<label>
											Custom hair colour
											<input
												aria-label="Hair color"
												type="color"
												value={recipe.palette.hair}
												onChange={(e) => {
													const value = e.target.value;
													updateRecipe((current) => ({
														...current,
														palette: { ...current.palette, hair: value },
													}));
												}}
											/>
										</label>
										<p className="creator-note">
											Colour also applies to the brows.
										</p>
									</>
								)}
								{creatorSection === "Clothing" && (
									<>
										<p className="creator-note">
											One everyday outfit. Choose its colours, then generate a
											preview.
										</p>
										<fieldset
											className="preset-grid outfit-presets"
											aria-label="Outfit"
										>
											<button
												type="button"
												aria-pressed={CLOTHING_SLOTS.every(
													(slot) =>
														recipe.clothing?.[slot] &&
														recipe.clothing[slot] !== "none",
												)}
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														clothing: everydayClothing(),
													}))
												}
											>
												<img
													src="/assets/creator-presets/everyday-outfit.jpg"
													alt="Grey T-shirt, dark trousers and brown ankle boots"
												/>
												<strong>Everyday Outfit</strong>
											</button>
											<button
												type="button"
												aria-pressed={sameClothing(
													recipe.clothing,
													noClothing(),
												)}
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														clothing: noClothing(),
													}))
												}
											>
												<img
													src="/assets/creator-presets/body-athletic.jpg"
													alt="Base character without an outfit"
												/>
												<strong>No outfit</strong>
											</button>
										</fieldset>
										{CLOTHING_SLOTS.map((slot) => {
											const chosen = recipe.clothing?.[slot];
											if (!chosen || chosen === "none") return null;
											const label =
												slot === "top"
													? "Top"
													: slot === "bottoms"
														? "Trousers"
														: "Shoes";
											return (
												<fieldset className="skin-presets" key={slot}>
													<legend>{label} colour</legend>
													{CLOTHING_SWATCHES[slot].map((swatch) => (
														<button
															type="button"
															key={swatch.color}
															title={swatch.name}
															aria-label={`${swatch.name} ${label.toLowerCase()}`}
															aria-pressed={chosen.color === swatch.color}
															style={{ backgroundColor: swatch.color }}
															onClick={() =>
																updateRecipe((current) => ({
																	...current,
																	clothing: {
																		...(current.clothing ?? noClothing()),
																		[slot]: { ...chosen, color: swatch.color },
																	},
																}))
															}
														/>
													))}
												</fieldset>
											);
										})}
									</>
								)}
								{creatorSection === "Appearance" && (
									<>
										<p className="creator-note">
											A subtle tint over the original painted skin.
										</p>
										<fieldset className="skin-presets">
											<legend>Tint</legend>
											{[
												{ color: "#ffffff", name: "Original" },
												{ color: "#f3ddcb", name: "Warm" },
												{ color: "#d8c5b6", name: "Muted" },
												{ color: "#b59a85", name: "Deep" },
											].map((tone) => (
												<button
													type="button"
													key={tone.color}
													aria-label={`${tone.name} tint`}
													aria-pressed={recipe.palette.skin === tone.color}
													style={{ backgroundColor: tone.color }}
													onClick={() =>
														updateRecipe((current) => ({
															...current,
															palette: {
																...current.palette,
																skin: tone.color,
															},
														}))
													}
												/>
											))}
										</fieldset>
										<label>
											Custom tint
											<input
												aria-label="Skin tint"
												type="color"
												value={recipe.palette.skin}
												onChange={(e) => {
													const value = e.target.value;
													updateRecipe((current) => ({
														...current,
														palette: { ...current.palette, skin: value },
													}));
												}}
											/>
										</label>
										<label>
											Skin finish
											<input
												aria-label="Skin finish"
												type="range"
												min={0.2}
												max={1}
												step={0.01}
												value={recipe.appearance.skin.roughness}
												onChange={(e) => {
													const value = Number(e.target.value);
													updateRecipe((current) => ({
														...current,
														appearance: {
															...current.appearance,
															skin: { roughness: value },
														},
													}));
												}}
											/>
											<span className="range-ends">
												<span>Satin</span>
												<span>Matte</span>
											</span>
										</label>
									</>
								)}
								{creatorSection !== "Character" && (
									<button
										className="reset-section"
										type="button"
										onClick={resetSection}
									>
										Reset {creatorSection.toLowerCase()}
									</button>
								)}
							</>
						) : (
							<>
								<label>
									Recipe id
									<input
										onChange={(event) =>
											updateRecipe((current) => ({
												...current,
												id: event.target.value,
											}))
										}
										value={recipe.id}
									/>
								</label>
								<label>
									Body preset
									<select
										onChange={(event) =>
											updateRecipe((current) => ({
												...current,
												body: {
													...current.body,
													baseId: event.target.value,
												},
											}))
										}
										value={recipe.body.baseId}
									>
										{BODY_BASE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</label>

								<div className="section-heading">Body</div>
								<div className="body-creator-panel">
									{PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS.filter(
										(key) => !isAuthored || key === "height",
									).map((key) => {
										const parameter = PROCEDURAL_MANNEQUIN_BODY_PARAMETERS[key];
										const value = recipe.body.parameters[key];
										return (
											<div className="body-creator-control" key={key}>
												<label>
													{parameter.label}
													<input
														aria-label={parameter.label}
														max={parameter.max}
														min={parameter.min}
														onChange={(event) =>
															updateBodyParameter(
																key,
																Number(event.target.value),
															)
														}
														step={parameter.step}
														type="range"
														value={value}
													/>
												</label>
												<div className="body-creator-value">
													<output
														aria-label={`Current ${parameter.label.toLowerCase()}`}
													>
														{value.toFixed(2)}
														{parameter.units === "metres" ? " m" : ""}
													</output>
													<button
														onClick={() =>
															updateBodyParameter(key, parameter.defaultValue)
														}
														type="button"
													>
														Reset {parameter.label.toLowerCase()}
													</button>
												</div>
											</div>
										);
									})}
									{identityControls("Body")}
									<div className="randomise-control" hidden={isAuthored}>
										<label>
											Random seed
											<input
												aria-label="Random seed"
												onChange={(event) => setRandomSeed(event.target.value)}
												value={randomSeed}
											/>
										</label>
										<button onClick={handleRandomise} type="button">
											Randomise
										</button>
									</div>
									{bodyValidation.ok ? (
										<p className="creator-note">
											Body proportions pass compiler anatomy validation.
										</p>
									) : (
										<div
											className="validation-list"
											aria-label="Body validation errors"
											role="alert"
										>
											{bodyValidation.issues.map((issue) => (
												<p key={`${issue.path}:${issue.message}`}>
													{issue.message}
												</p>
											))}
										</div>
									)}
								</div>

								<div className="section-heading">Appearance</div>
								<section
									aria-label="Skin appearance"
									className="appearance-panel"
								>
									<div className="appearance-control">
										<label>
											Skin color
											<input
												aria-label="Skin color"
												onChange={(event) =>
													updateRecipe((current) => ({
														...current,
														palette: {
															...current.palette,
															skin: event.target.value.toLowerCase(),
														},
													}))
												}
												type="color"
												value={recipe.palette.skin}
											/>
										</label>
										<div className="body-creator-value">
											<output aria-label="Current skin color">
												{recipe.palette.skin.toLowerCase()}
											</output>
											<button
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														palette: {
															...current.palette,
															skin: PROCEDURAL_SKIN_APPEARANCE.color
																.defaultValue,
														},
													}))
												}
												type="button"
											>
												Reset skin color
											</button>
										</div>
									</div>
									<fieldset className="skin-presets">
										<legend>Skin tone presets</legend>
										{SKIN_COLOR_PRESETS.map((preset) => (
											<button
												aria-label={`${preset.label} ${preset.color}`}
												key={preset.color}
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														palette: {
															...current.palette,
															skin: preset.color,
														},
													}))
												}
												style={{ backgroundColor: preset.color }}
												title={`${preset.label} ${preset.color}`}
												type="button"
											/>
										))}
									</fieldset>
									<div className="body-creator-control">
										<label>
											Skin roughness
											<input
												aria-label="Skin roughness"
												max={PROCEDURAL_SKIN_APPEARANCE.roughness.max}
												min={PROCEDURAL_SKIN_APPEARANCE.roughness.min}
												onChange={(event) =>
													updateRecipe((current) => ({
														...current,
														appearance: {
															...current.appearance,
															skin: {
																...current.appearance.skin,
																roughness: Number(event.target.value),
															},
														},
													}))
												}
												step={PROCEDURAL_SKIN_APPEARANCE.roughness.step}
												type="range"
												value={recipe.appearance.skin.roughness}
											/>
										</label>
										<div className="body-creator-value">
											<output aria-label="Current skin roughness">
												{recipe.appearance.skin.roughness.toFixed(2)}
											</output>
											<button
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														appearance: {
															...current.appearance,
															skin: {
																...current.appearance.skin,
																roughness:
																	PROCEDURAL_SKIN_APPEARANCE.roughness
																		.defaultValue,
															},
														},
													}))
												}
												type="button"
											>
												Reset skin roughness
											</button>
										</div>
									</div>
									<div className="appearance-comparison">
										<div>
											<span
												aria-label="Draft skin swatch"
												className="appearance-swatch"
												role="img"
												style={{ backgroundColor: recipe.palette.skin }}
											/>
											Draft · {recipe.palette.skin.toLowerCase()} ·{" "}
											{recipe.appearance.skin.roughness.toFixed(2)}
										</div>
										<div>
											<span
												aria-label="Compiled skin swatch"
												className="appearance-swatch"
												role="img"
												style={{
													backgroundColor:
														activeManifest?.appearance?.skin.authoredColor ??
														"transparent",
												}}
											/>
											Compiled ·{" "}
											{activeManifest?.appearance?.skin.authoredColor ?? "—"} ·{" "}
											{activeManifest?.appearance?.skin.authoredRoughness.toFixed(
												2,
											) ?? "—"}
										</div>
									</div>
									{appearanceValidation.ok ? null : (
										<div
											aria-label="Appearance validation errors"
											className="validation-list"
											role="alert"
										>
											{appearanceValidation.issues.map((issue) => (
												<p key={`${issue.path}:${issue.message}`}>
													{issue.message}
												</p>
											))}
										</div>
									)}
									<p className="creator-note">
										Appearance edits are draft recipe values. Generate Preview
										regenerates the GLB; the 3D preview is never recolored in
										the browser.
									</p>
								</section>

								<div className="section-heading">Face</div>
								{identityControls("Face")}
								<section
									aria-label="Face"
									className="appearance-panel"
									hidden={isAuthored}
								>
									<div className="appearance-control">
										<label>
											Eye color
											<input
												aria-label="Eye color"
												onChange={(event) =>
													updateRecipe((current) => ({
														...current,
														appearance: {
															...current.appearance,
															face: {
																...current.appearance.face,
																eyeColor: event.target.value.toLowerCase(),
															},
														},
													}))
												}
												type="color"
												value={recipe.appearance.face.eyeColor}
											/>
										</label>
										<div className="body-creator-value">
											<output aria-label="Current eye color">
												{recipe.appearance.face.eyeColor.toLowerCase()}
											</output>
											<button
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														appearance: {
															...current.appearance,
															face: {
																...current.appearance.face,
																eyeColor:
																	PROCEDURAL_FACE_APPEARANCE.eyeColor
																		.defaultValue,
															},
														},
													}))
												}
												type="button"
											>
												Reset eye color
											</button>
										</div>
									</div>
									<fieldset className="skin-presets">
										<legend>Eye color presets</legend>
										{EYE_COLOR_PRESETS.map((preset) => (
											<button
												aria-label={`Use ${preset.label} eye color`}
												key={preset.color}
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														appearance: {
															...current.appearance,
															face: {
																...current.appearance.face,
																eyeColor: preset.color,
															},
														},
													}))
												}
												style={{ backgroundColor: preset.color }}
												title={`${preset.label} ${preset.color}`}
												type="button"
											/>
										))}
									</fieldset>
									<div className="appearance-comparison">
										<div>
											<span
												aria-label="Draft eye swatch"
												className="appearance-swatch"
												role="img"
												style={{
													backgroundColor: recipe.appearance.face.eyeColor,
												}}
											/>
											Draft · {recipe.appearance.face.eyeColor.toLowerCase()}
										</div>
										<div>
											<span
												aria-label="Compiled eye swatch"
												className="appearance-swatch"
												role="img"
												style={{
													backgroundColor:
														activeManifest?.appearance?.face.authoredEyeColor ??
														"transparent",
												}}
											/>
											Compiled ·{" "}
											{activeManifest?.appearance?.face.authoredEyeColor ?? "—"}
										</div>
									</div>
									<p className="creator-note">
										Eye colour is authored recipe data. Generate Preview
										regenerates the two embedded eye meshes and their shared
										material; nose and mouth remain fixed readability geometry
										in {PROCEDURAL_FACE_FEATURE_VERSION}.
									</p>
								</section>

								<div className="section-heading">Recent Compilations</div>
								<section
									className="recent-compilations"
									aria-label="Recent Compilations"
								>
									{recentCompilations.length === 0 ? (
										<p className="creator-note">
											Compiled bodies will appear here (up to 10).
										</p>
									) : (
										recentCompilations.map((entry) => (
											<button
												aria-pressed={
													compileResult?.requestId === entry.result.requestId
												}
												key={entry.result.requestId}
												disabled={compileStatus === "compiling"}
												onClick={() => selectRecentCompilation(entry)}
												type="button"
											>
												{entry.parameters.height.toFixed(2)} m · {entry.seed}
												{" · "}
												{entry.result.manifest.validationLevel === "preview"
													? "Preview"
													: "Finalised"}
											</button>
										))
									)}
								</section>

								<div className="section-heading">Hair</div>
								<section aria-label="Hair" className="appearance-panel">
									<label>
										Hair color
										<input
											aria-label="Hair color"
											type="color"
											value={recipe.palette.hair}
											onChange={(event) =>
												updateRecipe((current) => ({
													...current,
													palette: {
														...current.palette,
														hair: event.target.value.toLowerCase(),
													},
												}))
											}
										/>
									</label>
									<div className="body-creator-value">
										<output aria-label="Current hair color">
											{recipe.palette.hair.toLowerCase()}
										</output>
										<button
											type="button"
											onClick={() =>
												updateRecipe((current) => ({
													...current,
													palette: { ...current.palette, hair: "#3b2a1f" },
												}))
											}
										>
											Reset hair color
										</button>
									</div>
									<fieldset className="skin-presets">
										<legend>Hair color presets</legend>
										{HAIR_COLOR_PRESETS.map((preset) => (
											<button
												key={preset.color}
												type="button"
												aria-label={`Use ${preset.label} hair color`}
												title={`${preset.label} ${preset.color}`}
												style={{ backgroundColor: preset.color }}
												onClick={() =>
													updateRecipe((current) => ({
														...current,
														palette: {
															...current.palette,
															hair: preset.color,
														},
													}))
												}
											/>
										))}
									</fieldset>
									<p>
										Draft color: {recipe.palette.hair.toLowerCase()} ? Compiled
										color:{" "}
										{activeManifest?.components.hair.componentId === "none"
											? "No hair"
											: (activeManifest?.appearance?.hair?.authoredColor ??
												"?")}
									</p>
									<p className="creator-note">
										Choose a hairstyle and Generate Preview to apply the colour.
										The colour is saved even when No hair is selected.
									</p>
									<label>
										Hairstyle
										<select
											aria-label="Hair component"
											onChange={(event) =>
												updateRecipe((current) =>
													replaceHairComponent(
														current,
														event.target.value as CharacterHairComponentId,
													),
												)
											}
											value={recipe.components.hair}
										>
											{HAIR_COMPONENT_OPTIONS.filter(
												(option) =>
													!isAuthored ||
													["none", "quaternius-hair-v0"].includes(option.id),
											).map((option) => (
												<option key={option.id} value={option.id}>
													{isAuthored && option.id !== "none"
														? "Short hair"
														: option.label}
												</option>
											))}
										</select>
									</label>
									<div className="appearance-comparison">
										<div>
											Draft ·{" "}
											{recipe.components.hair === "none"
												? "No hair"
												: draftHairComponent?.name}
										</div>
										<div>
											Compiled ·{" "}
											{getCharacterComponentDefinition(
												activeManifest?.components.hair.componentId ?? "none",
											)?.name ?? "No hair"}
										</div>
									</div>
									{draftHairComponent ? (
										<dl aria-label="Hair source status">
											<div>
												<dt>Provider</dt>
												<dd>{draftHairComponent?.provider}</dd>
											</div>
											<div>
												<dt>Provenance</dt>
												<dd>Validated · {draftHairComponent?.license.spdx}</dd>
											</div>
											<div>
												<dt>Fit profile</dt>
												<dd>
													{matchingHairManifest?.components.hair.fittingProfile
														?.id ?? draftHairComponent?.fittingProfile.id}
												</dd>
											</div>
											<div>
												<dt>Source bounds</dt>
												<dd>
													{matchingHairManifest?.components.hair.sourceBounds
														? matchingHairManifest.components.hair.sourceBounds.dimensions
																.map((value) => value.toFixed(3))
																.join(" × ")
														: "Generate Preview to inspect"}
												</dd>
											</div>
											<div>
												<dt>Fitted bounds</dt>
												<dd>
													{matchingHairManifest?.components.hair.bounds
														? matchingHairManifest.components.hair.bounds.dimensions
																.map((value) => value.toFixed(3))
																.join(" × ")
														: "Generate Preview to inspect"}
												</dd>
											</div>
											<div>
												<dt>Derived fit transform</dt>
												<dd>
													{matchingHairManifest?.components.hair
														.derivedTransform
														? `Scale ${matchingHairManifest.components.hair.derivedTransform.scale.map((value) => value.toFixed(3)).join("/")} · seat ${matchingHairManifest.components.hair.derivedTransform.fittedCrown[2].toFixed(3)} m`
														: "Generate Preview to inspect"}
												</dd>
											</div>
											<div>
												<dt>Fit validation</dt>
												<dd>
													{matchingHairManifest?.components.hair.fitValidation
														? matchingHairManifest.components.hair.fitValidation
																.passed
															? "Pass"
															: `Warnings: ${matchingHairManifest.components.hair.fitValidation.warnings.join(", ")}`
														: "Generate Preview to inspect"}
												</dd>
											</div>
											<div>
												<dt>Compiled geometry</dt>
												<dd>
													{matchingHairManifest?.components?.hair
														?.componentId === recipe.components.hair
														? `${matchingHairManifest.components.hair.meshCount} mesh · ${matchingHairManifest.components.hair.triangleCount} triangles · ${matchingHairManifest.components.hair.materialCount} material`
														: "Generate Preview to inspect"}
												</dd>
											</div>
										</dl>
									) : null}
									<p className="creator-note">
										Hair edits are draft recipe values. Generate Preview embeds
										the selected hairstyle in the complete GLB.
									</p>
								</section>
							</>
						)}
					</aside>

					<section className="preview-panel" aria-label="Character preview">
						<div className="preview-toolbar">
							<div>
								<strong>{recipe.name || "Untitled Character"}</strong>
								<span>
									{isAuthored
										? "Your character · drag to turn · scroll to zoom"
										: "Legacy procedural mannequin"}
								</span>
							</div>
							<label className="preview-source-picker" hidden={!showDetails}>
								Preview source
								<select
									onChange={(event) =>
										setPreviewSourceId(event.target.value as PreviewSourceId)
									}
									value={previewSourceId}
								>
									{Object.values(PREVIEW_SOURCES).map((source) => (
										<option key={source.fixtureId} value={source.fixtureId}>
											{source.displayName}
										</option>
									))}
								</select>
							</label>
						</div>
						<HumanoidPreview
							busy={isAuthored && compileStatus === "compiling"}
							key={`${previewSource.fixtureId}:${previewSource.revision}`}
							onManifestLoaded={setCurrentManifest}
							source={previewSource}
							creatorCamera={isAuthored ? creatorCamera : undefined}
							suggestedCamera={
								creatorSection === "Body" || creatorSection === "Clothing"
									? "full-body"
									: creatorSection === "Face" || creatorSection === "Hair"
										? "face"
										: creatorSection === "Appearance"
											? "upper-body"
											: "three-quarter"
							}
						/>
						{clothingIssues(recipe.clothing, recipe.geometry).map((message) => (
							<p role="alert" key={message}>
								{message}
							</p>
						))}
						<div
							className="compile-status"
							data-compile-status={compileStatus}
							data-dirty={compileDirty}
							aria-busy={compileStatus === "compiling"}
						>
							<div className="compile-summary">
								<strong>Character status</strong>
								<span role="status">
									{compileStatus === "compiling"
										? operation === "preview"
											? "Generating preview…"
											: "Finalising…"
										: compileStatus === "succeeded"
											? compileDirty
												? "Changes not previewed · Generate Preview to see your changes."
												: compileResult?.manifest.validationLevel === "preview"
													? "Preview ready"
													: "Character finalised"
											: compileStatus === "failed"
												? `Generation failed. ${compileError} The previous preview remains active.`
												: compileDirty
													? "Changes not previewed · Generate Preview to see your changes."
													: "Ready"}
								</span>
							</div>
							<button
								disabled={
									!validation.ok ||
									!bodyValidation.ok ||
									!appearanceValidation.ok ||
									compileStatus === "compiling"
								}
								className="generate-preview"
								onClick={() => handleCompile("preview")}
								type="button"
							>
								Generate Preview
							</button>
							<button
								type="button"
								disabled={
									!validation.ok ||
									!bodyValidation.ok ||
									!appearanceValidation.ok ||
									compileStatus === "compiling"
								}
								onClick={() => handleCompile("full")}
							>
								Finalise Character
							</button>
							<p>
								{isAuthored
									? "Preview to see your edits. Finalise when you’re ready to download."
									: "Generate Preview for fast iteration. Finalise Character runs the full validation and creates a reusable local asset."}
							</p>
							{technicalDetails && (
								<details>
									<summary>Technical details</summary>
									<pre
										style={{
											whiteSpace: "pre-wrap",
											maxHeight: "18rem",
											overflow: "auto",
										}}
									>
										{technicalDetails}
									</pre>
								</details>
							)}
							{compileStatus === "succeeded" &&
								!compileDirty &&
								compileResult?.manifest.validationLevel !== "preview" &&
								compileResult && (
									<div>
										<UseInGame recipe={recipe} result={compileResult} />
										<a href={compileResult.assetUrl} download="character.glb">
											Download character GLB
										</a>
										{(!isAuthored || showDetails) && " · "}
										<a
											hidden={isAuthored && !showDetails}
											href={compileResult.manifestUrl}
											download="manifest.json"
										>
											Manifest
										</a>
										{(!isAuthored || showDetails) && " · "}
										<a
											href={compileResult.manifestUrl.replace(
												"manifest.json",
												"recipe.snapshot.json",
											)}
											hidden={isAuthored && !showDetails}
											download="recipe.snapshot.json"
										>
											Compiler recipe
										</a>
									</div>
								)}
							<dl
								aria-label="Creator compilation diagnostics"
								hidden={!showDetails}
							>
								<div>
									<dt>Recipe hash</dt>
									<dd>{activeManifest?.recipeHash ?? "—"}</dd>
								</div>
								<div>
									<dt>Generated asset hash</dt>
									<dd>{activeManifest?.outputHash ?? "—"}</dd>
								</div>
								<div>
									<dt>Body topology</dt>
									<dd>
										{activeManifest
											? `${activeManifest.topologyVersion ?? "legacy-primitive-v0"} · ${activeManifest.vertexCount} vertices · ${activeManifest.triangleCount} triangles`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Compiler version</dt>
									<dd>{activeManifest?.compilerVersion ?? "—"}</dd>
								</div>
								<div>
									<dt>Head dimensions</dt>
									<dd>
										{activeManifest?.head
											? `${activeManifest.head.headWidth.toFixed(3)} × ${activeManifest.head.headHeight.toFixed(3)} × ${activeManifest.head.headDepth.toFixed(3)} m`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Scalp anchors</dt>
									<dd>
										{activeManifest?.head
											? `Top ${activeManifest.head.scalpTop[2].toFixed(3)} m · neck ${activeManifest.head.neckTop[2].toFixed(3)} m`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Compiled skin material</dt>
									<dd>
										{activeManifest?.appearance?.skin
											? `${activeManifest.appearance.skin.authoredColor} · roughness ${activeManifest.appearance.skin.authoredRoughness.toFixed(2)} · metallic ${activeManifest.appearance.skin.exportedMetallic.toFixed(2)}`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Face readability</dt>
									<dd>
										{activeManifest?.face
											? `${activeManifest.face.version} · ${activeManifest.face.eyeMeshCount} eyes · ${activeManifest.face.triangleCount} triangles`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Compiled eye material</dt>
									<dd>
										{activeManifest?.appearance?.face
											? `${activeManifest.appearance.face.authoredEyeColor} · ${activeManifest.appearance.face.materialSchemaVersion}`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Head contract</dt>
									<dd>{activeManifest?.head?.version ?? "—"}</dd>
								</div>
								<div>
									<dt>Generated timestamp</dt>
									<dd>{compileResult?.generatedAt ?? "—"}</dd>
								</div>
								<div>
									<dt>Validation status</dt>
									<dd>
										{activeManifest
											? `${activeManifest.validationLevel === "preview" ? "Preview checked; determinism not tested" : "Full validation passed"} · ${activeManifest.validationVersion}`
											: "—"}
									</dd>
								</div>
								<div>
									<dt>Compilation duration</dt>
									<dd>
										{compileResult
											? `${compileResult.compilationDurationMs} ms`
											: activeManifest
												? `${activeManifest.generationDurationMs} ms`
												: "—"}
									</dd>
								</div>
							</dl>
						</div>
					</section>

					<aside className="panel details-panel" hidden={!showDetails}>
						<div className="section-heading">Palette</div>
						<div className="palette-grid">
							{CHARACTER_PALETTE_REGIONS.filter(
								(region) => region !== "skin" && region !== "hair",
							).map((region) => (
								<label key={region}>
									{PALETTE_LABELS[region]}
									<input
										onChange={(event) =>
											updateRecipe((current) => ({
												...current,
												palette: {
													...current.palette,
													[region]: event.target.value,
												},
											}))
										}
										type="color"
										value={recipe.palette[region as CharacterPaletteRegion]}
									/>
								</label>
							))}
						</div>

						<div className="section-heading">Validation</div>
						{validation.ok ? (
							<p className="validation-ok">
								Recipe is valid CharacterRecipeV1.
							</p>
						) : (
							<div className="validation-list">
								{validation.issues.map((entry) => (
									<p key={`${entry.path}:${entry.message}`}>
										<strong>{entry.path}</strong> {entry.message}
									</p>
								))}
							</div>
						)}

						<div className="section-heading">Recipe JSON</div>
						<pre className="recipe-json" data-testid="recipe-json">
							{recipeJson}
						</pre>
					</aside>
				</main>
			) : (
				<main className="placeholder-workspace">
					<section className="panel placeholder-panel">
						<h1>{activeSection}</h1>
						<p>{activeSection} is a future Asset Studio section.</p>
						<p>No editor or compiler workflow is implemented here in V0.</p>
					</section>
				</main>
			)}

			<footer className="status-bar">
				<span>Your recipe stays editable.</span>
				<span>Drag to orbit · Scroll to zoom</span>
				<span>Generate Preview to apply your changes.</span>
				<span>Active section: {activeSection}</span>
			</footer>
		</div>
	);
}
