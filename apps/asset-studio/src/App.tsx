import {
	type CharacterCompileResultV1,
	createNotImplementedCharacterCompileResult,
} from "@adventure-game-builder/asset-compiler-contract";
import {
	CHARACTER_ANIMATION_STATES,
	CHARACTER_BODY_PARAMETER_LIMITS,
	CHARACTER_COMPONENT_SLOTS,
	CHARACTER_PALETTE_REGIONS,
	type CharacterAnimationState,
	type CharacterBodyParameters,
	type CharacterComponentSlot,
	type CharacterPaletteRegion,
	type CharacterRecipeV1,
	createDefaultCharacterRecipe,
	parseCharacterRecipe,
	serializeCharacterRecipe,
} from "@adventure-game-builder/character-contract";
import {
	GOLDEN_REFERENCE_HUMANOID_ASSET,
	requestThreeVisualAsset,
	type ThreeVisualAssetAnalysis,
} from "@adventure-game-builder/three-asset-preview";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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

const COMPONENT_OPTIONS: Record<CharacterComponentSlot, string[]> = {
	hair: ["short-curl", "tied-back", "none"],
	headwear: ["wide-brim-hat", "head-scarf", "none"],
	torso: ["linen-shirt", "sailor-coat", "none"],
	legs: ["canvas-trousers", "utility-skirt", "none"],
	feet: ["soft-boots", "deck-shoes", "none"],
	mainHand: ["training-cutlass", "lantern", "none"],
};

const COMPONENT_LABELS: Record<CharacterComponentSlot, string> = {
	hair: "Hair component",
	headwear: "Headwear component",
	torso: "Torso clothing",
	legs: "Leg clothing",
	feet: "Footwear",
	mainHand: "Main-hand item",
};

const PALETTE_LABELS: Record<CharacterPaletteRegion, string> = {
	skin: "Skin color",
	hair: "Hair color",
	primary: "Primary color",
	secondary: "Secondary color",
	metal: "Metal color",
};

const PARAMETER_LABELS: Record<keyof CharacterBodyParameters, string> = {
	height: "Height",
	build: "Build",
	shoulderWidth: "Shoulders",
	waist: "Waist",
	headScale: "Head scale",
};

const PARAMETER_STEP: Record<keyof CharacterBodyParameters, string> = {
	height: "0.01",
	build: "0.01",
	shoulderWidth: "0.01",
	waist: "0.01",
	headScale: "0.01",
};

function replaceComponentValue(
	recipe: CharacterRecipeV1,
	slot: CharacterComponentSlot,
	value: string,
): CharacterRecipeV1 {
	const components = { ...recipe.components };
	if (value === "none") {
		delete components[slot];
	} else {
		components[slot] = value;
	}
	return { ...recipe, components };
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

const GOLDEN_REFERENCE_FIXTURE_ID = "golden-reference-humanoid-v0";

function GoldenReferenceHumanoidPreview() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const hostRef = useRef<HTMLDivElement>(null);
	const resetViewRef = useRef<() => void>(() => undefined);
	const [status, setStatus] = useState<"loading" | "loaded" | "error">(
		"loading",
	);
	const [analysis, setAnalysis] = useState<ThreeVisualAssetAnalysis>();
	const [error, setError] = useState("");
	const [canResetView, setCanResetView] = useState(false);
	useEffect(() => {
		const canvas = canvasRef.current,
			host = hostRef.current;
		if (!canvas || !host || typeof WebGLRenderingContext === "undefined")
			return;
		let disposed = false,
			frame = 0;
		let activeClone: THREE.Group | undefined;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
		} catch (renderError) {
			setStatus("error");
			setError(
				renderError instanceof Error
					? renderError.message
					: "WebGL unavailable.",
			);
			return;
		}
		renderer.setClearColor(0xf6f8fb, 1);
		renderer.shadowMap.enabled = true;
		const scene = new THREE.Scene(),
			camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.enablePan = false;
		controls.minPolarAngle = 0.2;
		controls.maxPolarAngle = Math.PI / 2.05;
		controls.rotateSpeed = 0.7;
		controls.zoomSpeed = 0.8;
		let initialCameraPosition: THREE.Vector3 | undefined;
		let initialCameraTarget: THREE.Vector3 | undefined;
		const updateCameraMetadata = () => {
			host.dataset.cameraPosition = camera.position
				.toArray()
				.map((value) => value.toFixed(3))
				.join(",");
		};
		controls.addEventListener("change", updateCameraMetadata);
		scene.add(new THREE.HemisphereLight(0xffffff, 0xaab7c4, 1.8));
		const key = new THREE.DirectionalLight(0xffffff, 2.1);
		key.position.set(3, 5, 4);
		key.castShadow = true;
		const grid = new THREE.GridHelper(4, 16, 0x94a3b8, 0xd3dae2);
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(8, 8),
			new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.9 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(key, grid, ground);
		const resize = () => {
			const width = Math.max(1, host.clientWidth),
				height = Math.max(1, host.clientHeight);
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		};
		const render = () => {
			controls.update();
			renderer.render(scene, camera);
			frame = window.requestAnimationFrame(render);
		};
		const mountAsset = () => {
			const result = requestThreeVisualAsset(GOLDEN_REFERENCE_HUMANOID_ASSET, {
				onStateChange: mountAsset,
			});
			if (disposed || result.status === "loading") return;
			if (result.status === "error" || result.status === "missing") {
				setStatus("error");
				setError(
					result.status === "error" ? String(result.error) : "Fixture missing.",
				);
				return;
			}
			activeClone?.removeFromParent();
			const group = new THREE.Group();
			group.name = "GoldenReferenceHumanoidPreview";
			group.rotation.y = THREE.MathUtils.degToRad(
				result.definition.defaultRotationOffset ?? 0,
			);
			group.scale.setScalar(result.definition.defaultScale ?? 1);
			result.object.position.y = -result.analysis.bounds.minY;
			result.object.traverse((object) => {
				if (object instanceof THREE.Mesh) {
					object.castShadow = result.definition.castShadow ?? false;
					object.receiveShadow = result.definition.receiveShadow ?? false;
				}
			});
			group.add(result.object);
			scene.add(group);
			activeClone = group;
			const bounds = new THREE.Box3().setFromObject(group),
				center = bounds.getCenter(new THREE.Vector3()),
				radius = Math.max(
					bounds.getSize(new THREE.Vector3()).length() / 2,
					0.8,
				);
			camera.position.set(
				center.x + radius * 1.15,
				center.y + radius * 0.55,
				center.z + radius * 1.45,
			);
			controls.target.set(center.x, Math.max(center.y, 0.8), center.z);
			controls.minDistance = radius * 0.75;
			controls.maxDistance = radius * 3.5;
			controls.update();
			initialCameraPosition = camera.position.clone();
			initialCameraTarget = controls.target.clone();
			controls.saveState();
			resetViewRef.current = () => {
				if (!initialCameraPosition || !initialCameraTarget) return;
				const damping = controls.enableDamping;
				controls.enableDamping = false;
				controls.reset();
				camera.position.copy(initialCameraPosition);
				controls.target.copy(initialCameraTarget);
				controls.update();
				controls.enableDamping = damping;
				updateCameraMetadata();
			};
			updateCameraMetadata();
			setCanResetView(true);
			setAnalysis(result.analysis);
			setStatus("loaded");
		};
		const observer =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(resize);
		observer?.observe(host);
		resize();
		mountAsset();
		render();
		return () => {
			disposed = true;
			resetViewRef.current = () => undefined;
			window.cancelAnimationFrame(frame);
			observer?.disconnect();
			controls.removeEventListener("change", updateCameraMetadata);
			controls.dispose();
			activeClone?.removeFromParent();
			ground.geometry.dispose();
			(ground.material as THREE.Material).dispose();
			renderer.renderLists.dispose();
			renderer.dispose();
		};
	}, []);
	return (
		<div
			className="preview-host"
			data-preview-source={GOLDEN_REFERENCE_FIXTURE_ID}
			ref={hostRef}
		>
			<canvas aria-label="Golden Reference Humanoid preview" ref={canvasRef} />
			<fieldset className="preview-controls" aria-label="3D preview controls">
				<span>Drag to rotate · Scroll to zoom</span>
				<button
					disabled={!canResetView}
					onClick={() => resetViewRef.current()}
					type="button"
				>
					Reset view
				</button>
			</fieldset>
			<div className="preview-label">
				Golden Reference Humanoid · Reference fixture
			</div>
			<div className="preview-status" data-status={status}>
				{status === "loading"
					? "Loading reference fixture…"
					: status === "loaded"
						? "Reference fixture loaded · No embedded animation clips"
						: `Preview error: ${error}`}
			</div>
			<dl
				aria-label="Golden Reference Humanoid diagnostics"
				className="preview-diagnostics"
			>
				<div>
					<dt>Asset</dt>
					<dd>{GOLDEN_REFERENCE_HUMANOID_ASSET.id}</dd>
				</div>
				<div>
					<dt>Load</dt>
					<dd>{status}</dd>
				</div>
				<div>
					<dt>Skinned meshes</dt>
					<dd>{analysis?.skinnedMeshCount ?? "—"}</dd>
				</div>
				<div>
					<dt>Bones</dt>
					<dd>{analysis?.boneCount ?? "—"}</dd>
				</div>
				<div>
					<dt>Materials</dt>
					<dd>{analysis?.materialCount ?? "—"}</dd>
				</div>
				<div>
					<dt>Animation clips</dt>
					<dd>{analysis?.animationClips.length ?? "—"}</dd>
				</div>
				<div>
					<dt>Bounds</dt>
					<dd>
						{analysis
							? `${analysis.bounds.dimensions.x.toFixed(2)} × ${analysis.bounds.dimensions.y.toFixed(2)} × ${analysis.bounds.dimensions.z.toFixed(2)}`
							: "—"}
					</dd>
				</div>
				<div>
					<dt>Scale / facing</dt>
					<dd>
						{GOLDEN_REFERENCE_HUMANOID_ASSET.defaultScale} /{" "}
						{GOLDEN_REFERENCE_HUMANOID_ASSET.defaultRotationOffset}°
					</dd>
				</div>
			</dl>
		</div>
	);
}

export default function App() {
	const [activeSection, setActiveSection] =
		useState<(typeof NAV_SECTIONS)[number]>("Character");
	const [recipe, setRecipe] = useState<CharacterRecipeV1>(() =>
		createDefaultCharacterRecipe(),
	);
	const [previewState, setPreviewState] =
		useState<CharacterAnimationState>("idle");
	const [loadStatus, setLoadStatus] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const validation = useMemo(() => parseCharacterRecipe(recipe), [recipe]);
	const recipeJson = useMemo(() => JSON.stringify(recipe, null, 2), [recipe]);
	const compileResult: CharacterCompileResultV1 = useMemo(
		() =>
			createNotImplementedCharacterCompileResult(
				{ requestId: "asset-studio-v0-preview" },
				"Asset Studio V0 has no character compiler.",
			),
		[],
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

						<div className="field-grid">
							{Object.entries(PARAMETER_LABELS).map(([key, label]) => {
								const parameterKey = key as keyof CharacterBodyParameters;
								const limits = CHARACTER_BODY_PARAMETER_LIMITS[parameterKey];
								return (
									<label key={key}>
										{label}
										<input
											max={limits.max}
											min={limits.min}
											onChange={(event) =>
												updateBodyParameter(
													parameterKey,
													Number(event.target.value),
												)
											}
											step={PARAMETER_STEP[parameterKey]}
											type="number"
											value={recipe.body.parameters[parameterKey]}
										/>
									</label>
								);
							})}
						</div>

						<div className="section-heading">Components</div>
						<div className="field-grid">
							{CHARACTER_COMPONENT_SLOTS.map((slot) => (
								<label key={slot}>
									{COMPONENT_LABELS[slot]}
									<select
										onChange={(event) =>
											updateRecipe((current) =>
												replaceComponentValue(
													current,
													slot,
													event.target.value,
												),
											)
										}
										value={recipe.components[slot] ?? "none"}
									>
										{COMPONENT_OPTIONS[slot].map((componentId) => (
											<option key={componentId} value={componentId}>
												{componentId}
											</option>
										))}
									</select>
								</label>
							))}
						</div>
					</aside>

					<section className="preview-panel" aria-label="Character preview">
						<div className="preview-toolbar">
							<div>
								<strong>{recipe.name || "Untitled Character"}</strong>
								<span>{recipe.skeletonId} source recipe</span>
							</div>
							<label>
								Animation preview state (unavailable: fixture has no clips)
								<select
									disabled
									onChange={(event) =>
										setPreviewState(
											event.target.value as CharacterAnimationState,
										)
									}
									value={previewState}
								>
									{CHARACTER_ANIMATION_STATES.map((state) => (
										<option key={state} value={state}>
											{state}
										</option>
									))}
								</select>
							</label>
						</div>
						<GoldenReferenceHumanoidPreview />
						<div className="compile-status">
							<strong>Compile status</strong>
							<span>{compileResult.errors[0]}</span>
							<button disabled type="button">
								Compile GLB unavailable
							</button>
						</div>
					</section>

					<aside className="panel details-panel">
						<div className="section-heading">Palette</div>
						<div className="palette-grid">
							{CHARACTER_PALETTE_REGIONS.map((region) => (
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
				<span>GLB output is a future compiled artifact.</span>
				<span>Active section: {activeSection}</span>
			</footer>
		</div>
	);
}
