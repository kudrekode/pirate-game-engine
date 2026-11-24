import * as THREE from "three";
import { createTerrainSurfaceSampler } from "../../data/terrainSurface";
import type { GameArea } from "../../types/game";
import { groundRowRenderer } from "./groundRaster";
import {
	getWorldMaterialColor,
	resolveTerrainMaterialKey,
} from "./worldPresentation";

type GroundPixels = {
	cancel?: () => void;
	pixels: Uint8Array<ArrayBuffer>;
	size: number;
	ready: Promise<void>;
	complete: boolean;
	users: number;
};

// Keep at most four completed/in-flight colour rasters in the reuse list.
// GPU textures and materials still belong to individual scenes.
const rasters = new Map<string, GroundPixels>();
function acquireGroundPixels(area: GameArea, padding: number) {
	const moonlit = area.theme?.atmosphere === "moonlit";
	const key = JSON.stringify([
		area.width,
		area.height,
		padding,
		moonlit,
		area.terrainTiles,
	]);
	const cached = rasters.get(key);
	if (cached) {
		cached.users++;
		rasters.delete(key);
		rasters.set(key, cached);
		return cached;
	}
	const width = area.width + padding * 2;
	const height = area.height + padding * 2;
	const size = Math.min(
		padding > 0 ? 512 : 1024,
		Math.max(64, Math.max(width, height) * 32),
	);
	const pixels = new Uint8Array(size * size * 4);
	const palette = new Map<string, number[]>();
	const cells = new Map<number, number[]>();
	function tileColour(tileId: string) {
		const key = resolveTerrainMaterialKey(tileId);
		let result = palette.get(key);
		if (!result) {
			const hex =
				key === "water"
					? 0x8b9d8b
					: moonlit && key === "dirt"
						? 0x716353
						: getWorldMaterialColor(key);
			result = [hex >> 16, (hex >> 8) & 255, hex & 255];
			palette.set(key, result);
		}
		return result;
	}
	const background = tileColour("");
	for (const tile of area.terrainTiles) {
		if (
			tile.x >= 0 &&
			tile.x < area.width &&
			tile.y >= 0 &&
			tile.y < area.height
		)
			cells.set(tile.y * area.width + tile.x, tileColour(tile.tileId));
	}
	const input = {
		mapWidth: area.width,
		mapHeight: area.height,
		padding,
		size,
		moonlit,
		cells,
		background,
	};
	const renderRow = groundRowRenderer(input, pixels);
	let nextRow = 0;
	const entry: GroundPixels = {
		pixels,
		size,
		complete: false,
		users: 1,
		ready: Promise.resolve(),
	};
	entry.ready = new Promise<void>((resolve) => {
		function renderSlice() {
			if (!entry.users) {
				if (rasters.get(key) === entry) rasters.delete(key);
				resolve();
				return;
			}
			const until = performance.now() + 5;
			do {
				renderRow(nextRow++);
			} while (nextRow < size && performance.now() < until);
			if (nextRow < size) setTimeout(renderSlice, 0);
			else {
				entry.complete = true;
				entry.cancel = undefined;
				resolve();
			}
		}
		// A blocked worker URL (for example in an offline deployment) uses the
		// same pixel kernel cooperatively on the UI thread.
		let worker: Worker | undefined;
		let deadline: ReturnType<typeof setTimeout> | undefined;
		const stopWorker = () => {
			clearTimeout(deadline);
			worker?.terminate();
			worker = undefined;
		};
		entry.cancel = () => {
			stopWorker();
			if (rasters.get(key) === entry) rasters.delete(key);
			resolve();
		};
		let usingFallback = false;
		const fallback = () => {
			if (usingFallback) return;
			usingFallback = true;
			stopWorker();
			if (entry.users) setTimeout(renderSlice, 0);
		};
		if (typeof Worker === "undefined") {
			fallback();
			return;
		}
		try {
			worker = new Worker(
				new URL("./groundRaster.worker.ts", import.meta.url),
				{ type: "module" },
			);
			worker.onmessage = (event: MessageEvent<Uint8Array>) => {
				if (!worker) return;
				if (
					!(event.data instanceof Uint8Array) ||
					event.data.length !== pixels.length
				) {
					fallback();
					return;
				}
				pixels.set(event.data);
				entry.complete = true;
				entry.cancel = undefined;
				stopWorker();
				resolve();
			};
			worker.onerror = fallback;
			worker.onmessageerror = fallback;
			deadline = setTimeout(fallback, 15_000);
			worker.postMessage(input);
		} catch {
			fallback();
		}
	});
	rasters.set(key, entry);
	if (rasters.size > 4) rasters.delete(rasters.keys().next().value as string);
	return entry;
}

export function createGroundPresentation(
	area: GameArea | undefined,
	padding = 0,
) {
	if (!area)
		return {
			ready: Promise.resolve(),
			apply: (_mesh: THREE.Mesh) => {},
			dispose: () => {},
		};
	const raster = acquireGroundPixels(area, padding);
	const width = area.width + padding * 2;
	const height = area.height + padding * 2;
	const texture = new THREE.DataTexture(
		raster.pixels,
		raster.size,
		raster.size,
		THREE.RGBAFormat,
	);
	let live = true;
	const pending = new Set<THREE.MeshStandardMaterial>();
	let baseColourMap: THREE.DataTexture | undefined;
	function applyTexture(material: THREE.MeshStandardMaterial) {
		material.color.set(0xffffff);
		material.map = texture;
		material.needsUpdate = true;
	}
	const ready = raster.ready.then(() => {
		if (live) for (const material of pending) applyTexture(material);
		pending.clear();
		baseColourMap?.dispose();
		baseColourMap = undefined;
	});
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return {
		ready,
		texture,
		apply(mesh: THREE.Mesh) {
			const positions = mesh.geometry.getAttribute("position");
			const uv: number[] = [];
			for (let i = 0; i < positions.count; i++) {
				uv.push(
					(positions.getX(i) + mesh.position.x + width / 2) / width,
					(positions.getZ(i) + mesh.position.z + height / 2) / height,
				);
			}
			mesh.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
			for (const material of Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material]) {
				if (
					material instanceof THREE.MeshStandardMaterial &&
					!material.transparent
				) {
					if (raster.complete) applyTexture(material);
					else {
						// White keeps the authored colour visible and the shader's USE_MAP
						// variant stable while the full terrain texture is being computed.
						if (!baseColourMap) {
							baseColourMap = new THREE.DataTexture(
								new Uint8Array([255, 255, 255, 255]),
								1,
								1,
							);
							baseColourMap.needsUpdate = true;
						}
						material.map = baseColourMap;
						material.needsUpdate = true;
						pending.add(material);
					}
				}
			}
		},
		dispose() {
			if (!live) return;
			live = false;
			pending.clear();
			raster.users--;
			if (!raster.users && !raster.complete) raster.cancel?.();
			texture.dispose();
		},
	};
}

// Continue only complete, flat outdoor borders into the haze. This is a visual
// apron, excluded from the editor's terrain/entity pick lists and runtime state.
// Sparse maps, interiors and elevated borders retain their original edges.
export function createWorldEdgePresentation(
	area: GameArea | undefined,
	waterMaterial: THREE.MeshStandardMaterial,
	mode: "smooth" | "blocky",
	onGround?: (ready: Promise<void>) => void,
): THREE.Mesh[] {
	if (
		area?.kind !== "outdoor" ||
		area.terrainHeights?.some(
			(tile) =>
				tile.height !== 0 &&
				(tile.x === 0 ||
					tile.y === 0 ||
					tile.x === area.width - 1 ||
					tile.y === area.height - 1),
		)
	)
		return [];
	const sampler = createTerrainSurfaceSampler(area);
	for (let x = 0; x < area.width; x++) {
		if (!sampler.getTile(x, 0) || !sampler.getTile(x, area.height - 1))
			return [];
	}
	for (let y = 0; y < area.height; y++) {
		if (!sampler.getTile(0, y) || !sampler.getTile(area.width - 1, y))
			return [];
	}
	const coordinates = (length: number) => [
		-120,
		-60,
		-24,
		-8,
		...Array.from({ length: length + 1 }, (_, i) => i),
		length + 8,
		length + 24,
		length + 60,
		length + 120,
	];
	const xs = coordinates(area.width);
	const zs = coordinates(area.height);
	const vertices = { land: [] as number[], water: [] as number[] };
	for (let zi = 0; zi < zs.length - 1; zi++) {
		for (let xi = 0; xi < xs.length - 1; xi++) {
			const x = xs[xi];
			const z = zs[zi];
			if (x >= 0 && x < area.width && z >= 0 && z < area.height) continue;
			const tx = Math.max(0, Math.min(area.width - 1, x));
			const tz = Math.max(0, Math.min(area.height - 1, z));
			const water =
				resolveTerrainMaterialKey(sampler.getTile(tx, tz)?.tileId ?? "") ===
				"water";
			const target = water ? vertices.water : vertices.land;
			const point = (cx: number, cz: number) => [
				cx - area.width / 2,
				water || mode === "blocky"
					? sampler.getCellSurfaceY(tx, tz)
					: sampler.getCornerSurfaceY(cx, cz),
				cz - area.height / 2,
			];
			const a = point(x, z);
			const b = point(xs[xi + 1], z);
			const c = point(xs[xi + 1], zs[zi + 1]);
			const d = point(x, zs[zi + 1]);
			target.push(...a, ...c, ...b, ...c, ...a, ...d);
			if (!water) {
				// Close banks where the visual apron meets continued ocean. Without
				// this small skirt the sky shows through beneath the land edge.
				const waterAt = (gx: number, gz: number) =>
					resolveTerrainMaterialKey(
						sampler.getTile(
							Math.max(0, Math.min(area.width - 1, gx)),
							Math.max(0, Math.min(area.height - 1, gz)),
						)?.tileId ?? "",
					) === "water";
				const edges: Array<
					[number[], number[], number, number, number, number]
				> = [
					[a, b, tx, tz - 1, 0, -0.28],
					[b, c, tx + 1, tz, 0.28, 0],
					[c, d, tx, tz + 1, 0, 0.28],
					[d, a, tx - 1, tz, -0.28, 0],
				];
				for (const [p, q, gx, gz, dx, dz] of edges) {
					if (!waterAt(gx, gz)) continue;
					const r = [q[0] + dx, 0.18, q[2] + dz];
					const s = [p[0] + dx, 0.18, p[2] + dz];
					target.push(...p, ...q, ...r, ...r, ...s, ...p);
				}
			}
		}
	}
	return (Object.keys(vertices) as Array<keyof typeof vertices>).flatMap(
		(kind) => {
			if (!vertices[kind].length) return [];
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(vertices[kind], 3),
			);
			geometry.computeVertexNormals();
			const mesh = new THREE.Mesh(
				geometry,
				kind === "water"
					? waterMaterial
					: new THREE.MeshStandardMaterial({ roughness: 0.96 }),
			);
			mesh.userData = {
				presentationOnly: true,
				ignoreTerrainPicking: true,
				worldEdge: true,
			};
			// The apron lies outside playable bounds and the sun's shadow volume.
			// Avoid sampling the shadow map over this large background surface.
			mesh.receiveShadow = false;
			if (kind === "land") {
				const backdropGround = createGroundPresentation(area, 120);
				backdropGround.apply(mesh);
				onGround?.(backdropGround.ready);
				mesh.material.addEventListener("dispose", backdropGround.dispose);
			}
			return [mesh];
		},
	);
}
