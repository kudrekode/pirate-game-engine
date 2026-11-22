import "./projectShell.css";

export type ProjectSummary = {
	id: string;
	name: string;
	modifiedAt: string | null;
};

const modifiedDateFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

export function ProjectsScreen({
	projects,
	lastProjectId,
	onOpen,
	onNew,
}: {
	projects: ProjectSummary[];
	lastProjectId: string | null;
	onOpen: (id: string) => void;
	onNew: () => void;
}) {
	return (
		<main
			className="project-list-screen"
			aria-labelledby="editor-route-heading"
		>
			<div className="project-list-content">
				<h1
					id="editor-route-heading"
					className="project-headline"
					tabIndex={-1}
				>
					Your projects
				</h1>
				{projects.length === 0 && (
					<p className="project-screen-copy">
						Create a project or import a project JSON file.
					</p>
				)}
				<div className="project-cards">
					{projects.map(({ id, name, modifiedAt }) => {
						const displayName = name.trim() || "Untitled project";
						const modified = modifiedAt ? new Date(modifiedAt) : null;
						return (
							<button
								aria-describedby={`project-details-${id}`}
								aria-label={displayName}
								className="project-list-card"
								data-project-id={id}
								data-last-opened={id === lastProjectId || undefined}
								key={id}
								onClick={() => onOpen(id)}
								type="button"
							>
								<span className="project-card-mark" aria-hidden="true">
									{Array.from(displayName)[0].toLocaleUpperCase()}
								</span>
								<span className="project-card-content">
									<span className="project-card-title">{displayName}</span>
									<span
										className="project-card-details"
										id={`project-details-${id}`}
									>
										{modified && Number.isFinite(modified.getTime()) ? (
											<span>
												Edited{" "}
												<time dateTime={modifiedAt ?? undefined}>
													{modifiedDateFormatter.format(modified)}
												</time>
											</span>
										) : null}
										{id === lastProjectId && (
											<span className="project-card-recent">Last opened</span>
										)}
									</span>
								</span>
								<span aria-hidden="true" className="project-card-arrow">
									›
								</span>
							</button>
						);
					})}
					<button
						aria-label="New Project"
						className="project-list-card project-new-card"
						onClick={onNew}
						type="button"
					>
						<span className="project-card-mark" aria-hidden="true">
							+
						</span>
						<span className="project-card-content">
							<strong>New Project</strong>
							<span className="project-card-details">
								Start from a blank world or the feature demo
							</span>
						</span>
					</button>
				</div>
			</div>
		</main>
	);
}

export function ProjectHome<Id extends string>({
	name,
	workspaces,
	onOpen,
}: {
	name: string;
	workspaces: readonly {
		id: Id;
		label: string;
		description: string;
		icon: string;
	}[];
	onOpen: (id: Id) => void;
}) {
	return (
		<main
			className="project-home-screen"
			aria-labelledby="editor-route-heading"
		>
			<div className="project-home-heading">
				<p className="project-eyebrow">Project Home</p>
				<h1
					id="editor-route-heading"
					className="project-headline"
					tabIndex={-1}
				>
					{name.trim() || "Untitled project"}
				</h1>
				<p className="project-screen-copy">
					Assets, placements and story references are shared across workspaces.
				</p>
			</div>
			<nav className="project-home-grid" aria-label="Project workspaces">
				{workspaces.map(({ id, label, description, icon }) => (
					<button
						aria-describedby={`workspace-description-${id}`}
						aria-label={label}
						className="project-home-tile"
						data-workspace={id}
						key={id}
						onClick={() => onOpen(id)}
						type="button"
					>
						<span className="project-tile-icon" aria-hidden="true">
							{icon}
						</span>
						<span className="project-tile-copy">
							<span className="project-tile-title">{label}</span>
							<span id={`workspace-description-${id}`}>{description}</span>
						</span>
					</button>
				))}
			</nav>
		</main>
	);
}
