const audioMimeTypes = new Map([
	["audio/aac", "audio/aac"],
	["audio/flac", "audio/flac"],
	["audio/mp3", "audio/mpeg"],
	["audio/mp4", "audio/mp4"],
	["audio/mpeg", "audio/mpeg"],
	["audio/ogg", "audio/ogg"],
	["audio/vnd.wave", "audio/wav"],
	["audio/wav", "audio/wav"],
	["audio/wave", "audio/wav"],
	["audio/webm", "audio/webm"],
	["audio/x-flac", "audio/flac"],
	["audio/x-m4a", "audio/mp4"],
	["audio/x-wav", "audio/wav"],
]);

const audioExtensions = new Map([
	["aac", "audio/aac"],
	["flac", "audio/flac"],
	["m4a", "audio/mp4"],
	["mp3", "audio/mpeg"],
	["oga", "audio/ogg"],
	["ogg", "audio/ogg"],
	["opus", "audio/ogg"],
	["wav", "audio/wav"],
	["webm", "audio/webm"],
]);

const embeddedAudioHeaders = new Set(
	Array.from(audioMimeTypes.values(), (mime) => `data:${mime};base64`),
);

export const cinematicAudioMaxBytes = 2 * 1024 * 1024;
export const cinematicAudioFileAccept = [
	...Array.from(audioExtensions.keys(), (extension) => `.${extension}`),
	...audioMimeTypes.keys(),
].join(",");

export type ImportedCinematicAudio = { url: string; sourceName: string };

export function isEmbeddedCinematicAudio(value: string): boolean {
	if (value.length > Math.ceil(cinematicAudioMaxBytes / 3) * 4 + 32)
		return false;
	const comma = value.indexOf(",");
	if (comma < 0 || !embeddedAudioHeaders.has(value.slice(0, comma)))
		return false;
	const payload = value.slice(comma + 1);
	if (payload.length === 0 || payload.length % 4 !== 0) return false;
	const unpadded = payload.replace(/={1,2}$/, "");
	const decodedSize =
		(payload.length / 4) * 3 - (payload.length - unpadded.length);
	return (
		decodedSize <= cinematicAudioMaxBytes && !/[^A-Za-z0-9+/]/.test(unpadded)
	);
}

export function readCinematicAudioFile(
	file: File,
): Promise<ImportedCinematicAudio> {
	const extensionIndex = file.name.lastIndexOf(".");
	const extension =
		extensionIndex < 0 ? "" : file.name.slice(extensionIndex + 1).toLowerCase();
	const declaredType = file.type.toLowerCase();
	const mime =
		!declaredType || declaredType === "application/octet-stream"
			? audioExtensions.get(extension)
			: audioMimeTypes.get(declaredType);
	if (!mime)
		return Promise.reject(
			new Error("Choose a WAV, MP3, Ogg, FLAC, AAC, M4A or WebM audio file."),
		);
	if (file.size === 0)
		return Promise.reject(new Error("The audio file is empty."));
	if (file.size > cinematicAudioMaxBytes)
		return Promise.reject(new Error("Choose an audio file up to 2 MiB."));

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const url = reader.result;
			if (typeof url === "string" && isEmbeddedCinematicAudio(url)) {
				resolve({ url, sourceName: file.name });
			} else {
				reject(new Error("The audio file could not be read."));
			}
		};
		reader.onerror = () =>
			reject(new Error("The audio file could not be read."));
		reader.readAsDataURL(file.slice(0, file.size, mime));
	});
}
