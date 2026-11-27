import { useMemo, useState } from "react";
import { Button } from "@/components/ui/control";
import {
	type ProjectRecord,
	projectStorageBytes,
} from "../../data/projectCatalog";
import { ProjectDialog } from "./ProjectDialog";

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ProjectStorageDialog({
	records,
	activeId,
	lastProjectId,
	fileName,
	notice,
	onDelete,
	onRetry,
	onClose,
}: {
	records: ProjectRecord[];
	activeId: string | null;
	lastProjectId: string | null;
	fileName?: string;
	notice: string;
	onDelete: (id: string) => void;
	onRetry: () => void;
	onClose: () => void;
}) {
	const [selection, setSelection] = useState<ProjectRecord | null>(null);
	const [error, setError] = useState("");
	const rows = useMemo(
		() =>
			records
				.map((record) => {
					try {
						return {
							record,
							bytes: projectStorageBytes(localStorage, record.id),
						};
					} catch {
						// The browser may restrict storage after the project list was opened.
						return { record, bytes: null };
					}
				})
				.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)),
		[records],
	);
	const close = () => {
		if (selection) {
			setSelection(null);
			setError("");
		} else onClose();
	};

	return (
		<ProjectDialog
			title={selection ? "Delete project?" : "Manage storage"}
			onClose={close}
		>
			{selection ? (
				<>
					<p>
						Permanently delete{" "}
						<strong>{selection.name || "Untitled project"}</strong> from this
						browser? This removes its saved project, draft and project-specific
						game saves. Exported JSON files stay on disk.
					</p>
					{selection.modifiedAt && (
						<p>
							Last edited {new Date(selection.modifiedAt).toLocaleString()}.
						</p>
					)}
					{error && <p role="alert">{error}</p>}
					<div className="project-dialog-actions">
						<Button onClick={close}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={() => {
								try {
									onDelete(selection.id);
									setSelection(null);
									setError("");
								} catch {
									setError("Could not finish deleting the project. Try again.");
								}
							}}
						>
							Delete project
						</Button>
					</div>
				</>
			) : (
				<>
					{notice && <p role="status">{notice}</p>}
					{fileName && (
						<p>
							Ready to retry <strong>{fileName}</strong>.
						</p>
					)}
					{rows.length > 0 ? (
						<>
							<p>
								Saved projects in this browser, largest first. Sizes are
								approximate.
							</p>
							<ul className="project-storage-list">
								{rows.map(({ record, bytes }) => {
									const name = record.name || "Untitled project";
									return (
										<li key={record.id}>
											<div className="project-card-content">
												<strong>{name}</strong>
												<small className="project-card-details">
													{bytes !== null && <span>{formatSize(bytes)}</span>}
													{record.modifiedAt && (
														<time dateTime={record.modifiedAt}>
															{new Date(record.modifiedAt).toLocaleString()}
														</time>
													)}
													{record.id === activeId ? (
														<span>Currently open</span>
													) : (
														record.id === lastProjectId && (
															<span>Last opened</span>
														)
													)}
												</small>
											</div>
											<Button
												disabled={record.id === activeId}
												aria-label={`Delete ${name}`}
												onClick={() => setSelection(record)}
											>
												Delete
											</Button>
										</li>
									);
								})}
							</ul>
						</>
					) : (
						<>
							<p>No saved projects to delete in this browser.</p>
							{fileName && (
								<p>
									If the import still exceeds the available space, try opening
									the JSON in a fresh browser profile.
								</p>
							)}
						</>
					)}
					<div className="project-dialog-actions">
						<Button onClick={onClose}>Close</Button>
						{fileName && (
							<Button variant="default" onClick={onRetry}>
								Retry import
							</Button>
						)}
					</div>
				</>
			)}
		</ProjectDialog>
	);
}
