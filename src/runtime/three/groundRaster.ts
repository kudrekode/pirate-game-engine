export type GroundRasterInput = {
	mapWidth: number;
	mapHeight: number;
	padding: number;
	size: number;
	moonlit: boolean;
	cells: Map<number, number[]>;
	background: number[];
};

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

export function groundRowRenderer(
	input: GroundRasterInput,
	pixels: Uint8Array,
) {
	const { mapWidth, mapHeight, size, padding, moonlit, cells, background } =
		input;
	const width = mapWidth + 2 * padding;
	const height = mapHeight + 2 * padding;
	const colour = (x: number, y: number) =>
		cells.get(
			Math.max(0, Math.min(mapHeight - 1, y)) * mapWidth +
				Math.max(0, Math.min(mapWidth - 1, x)),
		) ?? background;
	const smooth = (v: number) => {
		const t = Math.max(0, Math.min(1, (v - 0.16) / 0.68));
		return t * t * (3 - 2 * t);
	};
	return function renderRow(py: number) {
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
				(grain - Math.floor(grain) - 0.5) * 0.035 +
				(moonlit
					? mottling * 0.18 +
						noise(x * 6.1, y * 6.1) * 0.12 +
						(grain - Math.floor(grain) - 0.5) * 0.22
					: 0);
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
	};
}
