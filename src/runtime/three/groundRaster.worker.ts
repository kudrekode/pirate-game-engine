import { type GroundRasterInput, groundRowRenderer } from "./groundRaster";

self.onmessage = (event: MessageEvent<GroundRasterInput>) => {
	const pixels = new Uint8Array(event.data.size ** 2 * 4);
	const render = groundRowRenderer(event.data, pixels);
	for (let row = 0; row < event.data.size; row++) render(row);
	self.postMessage(pixels, { transfer: [pixels.buffer] });
};
