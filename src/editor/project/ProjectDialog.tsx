import { type ReactNode, useMemo, useState } from "react";
import { Button, Input } from "@/components/ui/control";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ProjectPresetId } from "../../data/projectPresets";
import { projectPresets } from "../../data/projectPresets";
import { validateProject } from "../../data/validateProject";
import { useProjectStore } from "../../store/useProjectStore";
import type { GameProject } from "../../types/game";

export function ProjectDialog({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const [opener] = useState(() =>
		document.activeElement instanceof HTMLElement
			? document.activeElement
			: null,
	);

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="project-dialog"
				aria-describedby={undefined}
				onPointerDownOutside={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					if (document.activeElement === document.body) opener?.focus();
				}}
			>
				<DialogTitle>{title}</DialogTitle>
				{children}
			</DialogContent>
		</Dialog>
	);
}

function downloadJson(project: GameProject) {
	const fileName = `${project.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "game-project"}.json`;
	const blob = new Blob([JSON.stringify(project, null, 2)], {
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

export function NewProjectDialog({
	error,
	onClose,
	onCreate,
}: {
	error: string;
	onClose: () => void;
	onCreate: (preset: ProjectPresetId, name: string) => void;
}) {
	const [name, setName] = useState("");
	const [preset, setPreset] = useState<ProjectPresetId>("blank");
	return (
		<ProjectDialog title="Choose a starter project" onClose={onClose}>
			{error && <p role="alert">{error}</p>}
			<form
				onSubmit={(event) => {
					event.preventDefault();
					onCreate(preset, name);
				}}
			>
				<label>
					Project name
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name your world"
					/>
				</label>
				<fieldset className="project-preset-options">
					<legend>Start from</legend>
					{projectPresets.map((item) => (
						<label key={item.id}>
							<Input
								type="radio"
								name="project-preset"
								checked={preset === item.id}
								onChange={() => setPreset(item.id)}
							/>
							{item.label}
						</label>
					))}
				</fieldset>
				<div className="project-dialog-actions">
					<Button type="button" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="default">
						Create project
					</Button>
				</div>
			</form>
		</ProjectDialog>
	);
}

export function ProjectTools({
	project,
	canLoad,
	onClose,
	onImport,
	onLoad,
	onReset,
}: {
	project: GameProject;
	canLoad: boolean;
	onClose: () => void;
	onImport: () => void;
	onLoad: () => void;
	onReset: () => void;
}) {
	const issues = useMemo(() => validateProject(project), [project]);
	const issueLabel = issues.some((issue) => issue.severity === "error")
		? `${issues.length} issues`
		: issues.length > 0
			? `${issues.length} warning${issues.length === 1 ? "" : "s"}`
			: "0 issues";
	return (
		<ProjectDialog title="Project tools" onClose={onClose}>
			<label>
				Project
				<Input
					value={project.metadata.name}
					onChange={(event) =>
						useProjectStore
							.getState()
							.updateMetadata({ name: event.target.value })
					}
				/>
			</label>
			<div className="project-tool-buttons">
				<Button type="button" onClick={() => downloadJson(project)}>
					Export JSON
				</Button>
				<Button type="button" onClick={onImport}>
					Import JSON
				</Button>
				<Button type="button" onClick={onLoad} disabled={!canLoad}>
					Load
				</Button>
				<Button type="button" onClick={onReset}>
					Reset
				</Button>
			</div>
			<details className="project-validation">
				<summary>Validation · {issueLabel}</summary>
				<section aria-label="Project validation issues">
					{issues.length === 0 ? (
						<p>No validation issues.</p>
					) : (
						<ul>
							{issues.map((issue) => (
								<li key={issue.id}>
									<strong>{issue.severity}</strong> {issue.message}
								</li>
							))}
						</ul>
					)}
				</section>
			</details>
			<div className="project-dialog-actions">
				<Button type="button" onClick={onClose}>
					Close
				</Button>
			</div>
		</ProjectDialog>
	);
}
