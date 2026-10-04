import {
	CHARACTER_HAIR_COMPONENT_IDS,
	CHARACTER_PALETTE_REGIONS,
	type CharacterBodyParameters,
	type CharacterHairComponentId,
	type CharacterPaletteRegion,
	type CharacterRecipeV1,
	createDefaultCharacterRecipe,
	getCharacterComponentDefinition,
	parseCharacterRecipe,
	serializeCharacterRecipe,
} from "@adventure-game-builder/character-contract";
import {
	PROCEDURAL_MANNEQUIN_V0_ASSET,
	type ThreeVisualAssetDefinition,
} from "@adventure-game-builder/three-asset-preview";
import { useMemo, useRef, useState } from "react";
import { HumanoidPreview } from "./HumanoidPreview";
import {
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

const NAV_SECTIONS = [
	"Character",
	"Components",
	"Materials",
	"Animations",
	"Export",
] as const;

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
	const [activeSection, setActiveSection] =
		useState<(typeof NAV_SECTIONS)[number]>("Character");
	const [recipe, setRecipe] = useState<CharacterRecipeV1>(() => {
		return createDefaultCharacterRecipe();
	});
	const [randomSeed, setRandomSeed] = useState("asset-studio-1");
	const [recentCompilations, setRecentCompilations] = useState<
		RecentCompilation[]
	>([]);
	const [loadStatus, setLoadStatus] = useState("");
	const [compileStatus, setCompileStatus] = useState<
		"idle" | "compiling" | "succeeded" | "failed"
	>("idle");
	const [compileError, setCompileError] = useState("");
	const [compileResult, setCompileResult] =
		useState<ProceduralMannequinCompileResult>();
	const [currentManifest, setCurrentManifest] =
		useState<ProceduralMannequinManifest>();
	const [compiledPreviewSource, setCompiledPreviewSource] =
		useState<PreviewSource>();
	const [previewSourceId, setPreviewSourceId] = useState<PreviewSourceId>(
		GOLDEN_REFERENCE_FIXTURE_ID,
	);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const validation = useMemo(() => parseCharacterRecipe(recipe), [recipe]);
	const recipeJson = useMemo(() => JSON.stringify(recipe, null, 2), [recipe]);
	const bodyValidation = validateProceduralMannequinBody(
		recipe.body.parameters,
	);
	const appearanceValidation = validateProceduralMannequinAppearance(recipe);
	const previewSource =
		previewSourceId === PROCEDURAL_MANNEQUIN_FIXTURE_ID && compiledPreviewSource
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
		compileResult &&
			(!PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS.every(
				(key) =>
					compileResult.manifest.proportions[key] ===
					recipe.body.parameters[key],
			) ||
				compileResult.manifest.appearance.skin.authoredColor !==
					recipe.palette.skin.toLowerCase() ||
				compileResult.manifest.appearance.skin.authoredRoughness !==
					recipe.appearance.skin.roughness ||
				compileResult.manifest.appearance.hair.authoredColor !==
					recipe.palette.hair.toLowerCase() ||
				compileResult.manifest.appearance.face.authoredEyeColor !==
					recipe.appearance.face.eyeColor.toLowerCase() ||
				compileResult.manifest.components.hair.componentId !==
					recipe.components.hair),
	);

	function updateRecipe(
		updater: (current: CharacterRecipeV1) => CharacterRecipeV1,
	) {
		setRecipe((current) => updater(current));
		setLoadStatus("");
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
		setCompileStatus("idle");
		setCompileError("");
	}

	function selectRecentCompilation(compilation: RecentCompilation) {
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
		setCompileResult(compilation.result);
		setCurrentManifest(compilation.result.manifest);
		setCompiledPreviewSource(compilation.source);
		setPreviewSourceId(PROCEDURAL_MANNEQUIN_FIXTURE_ID);
		setCompileStatus("succeeded");
		setCompileError("");
	}

	async function handleCompile() {
		if (
			!bodyValidation.ok ||
			!appearanceValidation.ok ||
			compileStatus === "compiling"
		)
			return;
		setCompileStatus("compiling");
		setCompileError("");
		try {
			const result = await requestProceduralMannequinCompile(recipe);
			const definition: ThreeVisualAssetDefinition = {
				...PROCEDURAL_MANNEQUIN_V0_ASSET,
				id: `procedural-mannequin-creator-${result.requestId}`,
				name: `Procedural Mannequin ${result.manifest.heightMetres.toFixed(2)} m`,
				url: result.assetUrl,
			};
			const source: PreviewSource = {
				artifactUrl: result.assetUrl,
				definition,
				description: `Locally compiled ${result.manifest.heightMetres.toFixed(2)} m creator artifact`,
				displayName: "Procedural Mannequin V1",
				fixtureId: PROCEDURAL_MANNEQUIN_FIXTURE_ID,
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
			setPreviewSourceId(PROCEDURAL_MANNEQUIN_FIXTURE_ID);
			setCompileStatus("succeeded");
		} catch (error) {
			setCompileError(
				error instanceof Error ? error.message : "Compilation failed.",
			);
			setCompileStatus("failed");
		}
	}

	function handleLoadRecipe(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		file
			.text()
			.then((raw) => {
				const parsed = parseCharacterRecipe(JSON.parse(raw));
				if (!parsed.ok) {
					setLoadStatus(
						`Recipe rejected: ${parsed.issues[0]?.message ?? "Invalid recipe."}`,
					);
					return;
				}
				setRecipe(parsed.value);
				setLoadStatus(`Loaded ${file.name}.`);
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
		<div className="asset-studio-shell">
			<header className="top-bar">
				<div className="brand-lockup">
					<span className="brand-mark">AS</span>
					<div>
						<strong>Asset Studio</strong>
						<span>Character recipe foundation</span>
					</div>
				</div>
				<nav aria-label="Asset Studio sections" className="top-nav">
					{NAV_SECTIONS.map((section) => (
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
						disabled={!validation.ok}
						onClick={() => downloadRecipe(recipe)}
						type="button"
					>
						Save Recipe JSON
					</button>
					<button onClick={() => fileInputRef.current?.click()} type="button">
						Load Recipe JSON
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
				<main className="workspace">
					<aside className="panel creation-panel">
						<h1>Character</h1>
						<label>
							Recipe name
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
							{PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS.map((key) => {
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
													updateBodyParameter(key, Number(event.target.value))
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
							<div className="randomise-control">
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
						<section aria-label="Skin appearance" className="appearance-panel">
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
													skin: PROCEDURAL_SKIN_APPEARANCE.color.defaultValue,
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
												palette: { ...current.palette, skin: preset.color },
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
															PROCEDURAL_SKIN_APPEARANCE.roughness.defaultValue,
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
								Appearance edits are draft recipe values. Compile regenerates
								the GLB; the 3D preview is never recolored in the browser.
							</p>
						</section>

						<div className="section-heading">Face</div>
						<section aria-label="Face" className="appearance-panel">
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
															PROCEDURAL_FACE_APPEARANCE.eyeColor.defaultValue,
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
										style={{ backgroundColor: recipe.appearance.face.eyeColor }}
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
								Eye colour is authored recipe data. Compile regenerates the two
								embedded eye meshes and their shared material; nose and mouth
								remain fixed readability geometry in{" "}
								{PROCEDURAL_FACE_FEATURE_VERSION}.
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
										onClick={() => selectRecentCompilation(entry)}
										type="button"
									>
										{entry.parameters.height.toFixed(2)} m · {entry.seed}
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
												palette: { ...current.palette, hair: preset.color },
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
									: (activeManifest?.appearance?.hair?.authoredColor ?? "?")}
							</p>
							<p className="creator-note">
								Choose a hairstyle and Compile to apply the colour. The colour
								is saved even when No hair is selected.
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
									{HAIR_COMPONENT_OPTIONS.map((option) => (
										<option key={option.id} value={option.id}>
											{option.label}
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
												: "Compile to inspect"}
										</dd>
									</div>
									<div>
										<dt>Fitted bounds</dt>
										<dd>
											{matchingHairManifest?.components.hair.bounds
												? matchingHairManifest.components.hair.bounds.dimensions
														.map((value) => value.toFixed(3))
														.join(" × ")
												: "Compile to inspect"}
										</dd>
									</div>
									<div>
										<dt>Derived fit transform</dt>
										<dd>
											{matchingHairManifest?.components.hair.derivedTransform
												? `Scale ${matchingHairManifest.components.hair.derivedTransform.scale.map((value) => value.toFixed(3)).join("/")} · seat ${matchingHairManifest.components.hair.derivedTransform.fittedCrown[2].toFixed(3)} m`
												: "Compile to inspect"}
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
												: "Compile to inspect"}
										</dd>
									</div>
									<div>
										<dt>Compiled geometry</dt>
										<dd>
											{matchingHairManifest?.components?.hair?.componentId ===
											recipe.components.hair
												? `${matchingHairManifest.components.hair.meshCount} mesh · ${matchingHairManifest.components.hair.triangleCount} triangles · ${matchingHairManifest.components.hair.materialCount} material`
												: "Compile to inspect"}
										</dd>
									</div>
								</dl>
							) : null}
							<p className="creator-note">
								Hair edits are draft recipe values. Compile embeds the selected
								hairstyle in the complete GLB.
							</p>
						</section>
					</aside>

					<section className="preview-panel" aria-label="Character preview">
						<div className="preview-toolbar">
							<div>
								<strong>{recipe.name || "Untitled Character"}</strong>
								<span>{recipe.skeletonId} source recipe</span>
							</div>
							<label>
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
							key={`${previewSource.fixtureId}:${previewSource.revision}`}
							onManifestLoaded={setCurrentManifest}
							source={previewSource}
						/>
						<div className="compile-status" data-compile-status={compileStatus}>
							<div className="compile-summary">
								<strong>Compilation status</strong>
								<span>
									{compileStatus === "compiling"
										? "Running the local headless Blender compiler and validation pipeline…"
										: compileStatus === "succeeded"
											? compileDirty
												? "Recipe changed. Compile again to update the preview."
												: "Compilation and validation succeeded; the generated GLB is active."
											: compileStatus === "failed"
												? `Compilation failed. The previous preview remains active. ${compileError}`
												: "Ready to compile body proportions through the local Blender development endpoint."}
								</span>
							</div>
							<button
								disabled={
									!bodyValidation.ok ||
									!appearanceValidation.ok ||
									compileStatus === "compiling"
								}
								onClick={handleCompile}
								type="button"
							>
								{compileStatus === "compiling" ? "Compiling…" : "Compile"}
							</button>
							<dl aria-label="Creator compilation diagnostics">
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
											? `Pass · ${activeManifest.validationVersion}`
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

					<aside className="panel details-panel">
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
						{loadStatus ? <p className="load-status">{loadStatus}</p> : null}

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
				<span>CharacterRecipeV1 is editable source data.</span>
				<span>The mannequin GLB is a derived compiler artifact.</span>
				<span>
					Body proportions rebuild it through the local Blender compiler.
				</span>
				<span>Active section: {activeSection}</span>
			</footer>
		</div>
	);
}
