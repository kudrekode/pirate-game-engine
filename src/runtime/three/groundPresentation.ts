import * as THREE from "three";
import { createTerrainSurfaceSampler } from "../../data/terrainSurface";
import type { GameArea } from "../../types/game";
import {
	getWorldMaterialColor,
	resolveTerrainMaterialKey,
} from "./worldPresentation";

function noise(x: number, y: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const hash = (a: number, b: number) => {
		let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
	};
	const fx = x - ix;
	const fy = y - iy;
	const u = fx * fx * (3 - 2 * fx);
	const v = fy * fy * (3 - 2 * fy);
	return (
		((hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) +
			(hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v) *
			2 -
		1
	);
}

// A bounded, disposable colour wash over the existing terrain. Nothing is authored
// or displaced: tile identities, picking, heights and gameplay bounds stay intact.
export function createGroundPresentation(
	area: GameArea | undefined,
	padding = 0,
) {
	if (!area) return { apply: (_mesh: THREE.Mesh) => {}, dispose: () => {} };
	const sampler = createTerrainSurfaceSampler(area);
	const width = area.width + padding * 2;
	const height = area.height + padding * 2;
	const size = Math.min(
		padding > 0 ? 512 : 1024,
		Math.max(64, Math.max(width, height) * 32),
	);
	const pixels = new Uint8Array(size * size * 4);
	const palette = new Map<string, number[]>();
	const colour = (x: number, y: number) => {
		const tile = sampler.getTile(
			Math.max(0, Math.min(area.width - 1, x)),
			Math.max(0, Math.min(area.height - 1, y)),
		);
		const key = resolveTerrainMaterialKey(tile?.tileId ?? "");
		let result = palette.get(key);
		if (!result) {
			// Damp sand under the water-facing end of the existing sloping bank.
			const hex = key === "water" ? 0x8b9d8b : getWorldMaterialColor(key);
			result = [hex >> 16, (hex >> 8) & 255, hex & 255];
			palette.set(key, result);
		}
		return result;
	};
	const smooth = (v: number) => {
		const t = Math.max(0, Math.min(1, (v - 0.16) / 0.68));
		return t * t * (3 - 2 * t);
	};
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const x = ((px + 0.5) / size) * width - padding - 0.5;
			const y = ((py + 0.5) / size) * height - padding - 0.5;
			const mottling = noise(x * 1.1, y * 1.1) + noise(x * 3.7, y * 3.7) * 0.3;
			const gx = x + mottling * 0.14;
			const gy = y + noise(x * 2.3 + 19, y * 2.3) * 0.09;
			const ix = Math.floor(gx);
			const iy = Math.floor(gy);
			const u = smooth(gx - ix);
			const v = smooth(gy - iy);
			const colours = [
				colour(ix, iy),
				colour(ix + 1, iy),
				colour(ix, iy + 1),
				colour(ix + 1, iy + 1),
			];
			const grain = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
			const tint =
				1 +
				mottling * 0.05 +
				Math.sin(x * 0.65 + y * 0.8) * 0.025 +
				(grain - Math.floor(grain) - 0.5) * 0.035;
			const offset = (py * size + px) * 4;
			for (let channel = 0; channel < 3; channel++) {
				const top = colours[0][channel] * (1 - u) + colours[1][channel] * u;
				const bottom = colours[2][channel] * (1 - u) + colours[3][channel] * u;
				pixels[offset + channel] = Math.min(
					255,
					(top * (1 - v) + bottom * v) * tint,
				);
			}
			pixels[offset + 3] = 255;
		}
	}
	const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return {
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
					material.color.set(0xffffff);
					material.map = texture;
				}
			}
		},
		dispose: () => texture.dispose(),
	};
}

// Continue only complete, flat outdoor borders into the haze. This is a visual
// apron, excluded from the editor's terrain/entity pick lists and runtime state.
// Sparse maps, interiors and authored elevations retain their original edges.
export function createWorldEdgePresentation(
	area: GameArea | undefined,
	waterMaterial: THREE.MeshStandardMaterial,
	mode: "smooth" | "blocky",
): THREE.Mesh[] {
	if (
		area?.kind !== "outdoor" ||
		area.terrainHeights?.some((tile) => tile.height !== 0)
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
				mesh.material.addEventListener("dispose", backdropGround.dispose);
			}
			return [mesh];
		},
	);
}
