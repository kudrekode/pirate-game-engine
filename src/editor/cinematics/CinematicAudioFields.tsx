import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
	cinematicAudioFileAccept,
	type ImportedCinematicAudio,
	readCinematicAudioFile,
} from "../../data/cinematicAudioImport";
import { isCinematicAudioUrl } from "../../runtime/cinematicTimeline";

const audioUrlHelp = "Enter a root-relative path or an HTTPS audio URL.";

function AudioFileInput({
	onImport,
	onReadingChange,
}: {
	onImport: (source: ImportedCinematicAudio) => void;
	onReadingChange?: (reading: boolean) => void;
}) {
	const helpId = useId();
	const latestImport = useRef(onImport);
	const pending = useRef<symbol | undefined>(undefined);
	const [reading, setReading] = useState(false);
	const [error, setError] = useState<string>();
	useLayoutEffect(() => {
		latestImport.current = onImport;
	}, [onImport]);
	useEffect(
		() => () => {
			pending.current = undefined;
		},
		[],
	);

	async function importFile(file: File) {
		const request = Symbol();
		pending.current = request;
		setError(undefined);
		setReading(true);
		onReadingChange?.(true);
		try {
			const source = await readCinematicAudioFile(file);
			if (pending.current === request) latestImport.current(source);
		} catch (error) {
			if (pending.current === request)
				setError(
					error instanceof Error
						? error.message
						: "The audio file could not be read.",
				);
		} finally {
			if (pending.current === request) {
				pending.current = undefined;
				setReading(false);
				onReadingChange?.(false);
			}
		}
	}

	return (
		<>
			<label>
				Import audio file
				<input
					type="file"
					accept={cinematicAudioFileAccept}
					aria-describedby={helpId}
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];
						event.currentTarget.value = "";
						if (file) void importFile(file);
					}}
				/>
			</label>
			<small id={helpId}>
				WAV, MP3, Ogg, FLAC, AAC, M4A or WebM, up to 2 MiB.
			</small>
			{reading && <small role="status">Reading audio file…</small>}
			{error && <small role="alert">{error}</small>}
		</>
	);
}

export function AudioCueCreator({
	onAdd,
	onCancel,
}: {
	onAdd: (url: string, sourceName?: string) => void;
	onCancel: () => void;
}) {
	const [url, setUrl] = useState("");
	const [embedded, setEmbedded] = useState<ImportedCinematicAudio>();
	const [reading, setReading] = useState(false);
	const [error, setError] = useState<string>();
	return (
		<form
			className="form-stack"
			onSubmit={(event) => {
				event.preventDefault();
				if (reading) return;
				if (embedded) onAdd(embedded.url, embedded.sourceName);
				else if (isCinematicAudioUrl(url.trim())) onAdd(url.trim());
				else setError(audioUrlHelp);
			}}
		>
			<label>
				Audio file URL
				<input
					value={url}
					disabled={reading}
					aria-invalid={!!error}
					placeholder="/audio/voice.ogg or https://…"
					onChange={(event) => {
						setUrl(event.currentTarget.value);
						setEmbedded(undefined);
						setError(undefined);
					}}
				/>
			</label>
			{error && <small role="alert">{error}</small>}
			<AudioFileInput
				onReadingChange={setReading}
				onImport={(source) => {
					setEmbedded(source);
					setUrl("");
					setError(undefined);
				}}
			/>
			{embedded && <small>{embedded.sourceName}</small>}
			<div className="cinematic-editor-actions">
				<button type="submit" className="primary-button" disabled={reading}>
					Add audio cue
				</button>
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</form>
	);
}

export function CinematicAudioSourceFields({
	url,
	sourceName,
	onChange,
}: {
	url: string;
	sourceName?: string;
	onChange: (url: string, sourceName?: string) => void;
}) {
	const embedded = url.startsWith("data:");
	const externalUrl = embedded ? "" : url;
	const [reading, setReading] = useState(false);
	const [error, setError] = useState<string>();
	return (
		<>
			{embedded && <small>{sourceName || "Embedded audio file"}</small>}
			<label>
				Audio file URL
				<input
					key={externalUrl}
					defaultValue={externalUrl}
					disabled={reading}
					placeholder="/audio/voice.ogg or https://…"
					onChange={() => setError(undefined)}
					onKeyDown={(event) => {
						if (event.key === "Enter") event.currentTarget.blur();
					}}
					onBlur={(event) => {
						const next = event.currentTarget.value.trim();
						if (next === externalUrl) return;
						if (isCinematicAudioUrl(next)) onChange(next);
						else {
							setError(audioUrlHelp);
							event.currentTarget.value = externalUrl;
						}
					}}
				/>
			</label>
			{error && <small role="alert">{error}</small>}
			<AudioFileInput
				onReadingChange={setReading}
				onImport={(source) => {
					setError(undefined);
					onChange(source.url, source.sourceName);
				}}
			/>
		</>
	);
}
