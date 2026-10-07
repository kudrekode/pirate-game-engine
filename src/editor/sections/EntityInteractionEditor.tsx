import { useState } from "react";
import type {
	GameProject,
	Interaction,
	ObjectBehaviour,
} from "../../types/game";

type Props = {
	project: GameProject;
	kind: "object" | "npc" | "event" | "structure";
	name: string;
	interaction?: Interaction;
	behaviour?: ObjectBehaviour;
	onChange: (interaction: Interaction, behaviour?: ObjectBehaviour) => void;
	onCreateItem: (name: string) => string;
};

export function EntityInteractionEditor({
	project,
	kind,
	name,
	interaction,
	behaviour,
	onChange,
	onCreateItem,
}: Props) {
	const [newItemName, setNewItemName] = useState("");
	const enabled = interaction
		? interaction.activationMode !== "disabled"
		: !!behaviour && behaviour.type !== "none";
	const type =
		interaction?.type === "collect_item"
			? "pickup"
			: interaction?.type === "show_message"
				? "message"
				: behaviour?.type === "container" || behaviour?.type === "door"
					? behaviour.type
					: interaction?.type === "set_flag"
						? "flag"
						: interaction?.type === "teleport" ||
								interaction?.type === "area_link"
							? "transition"
							: interaction || (behaviour && behaviour.type !== "none")
								? "advanced"
								: "message";
	const defaultMode = kind === "event" ? "on_touch" : "on_interact";
	function choose(next: string) {
		const base = { activationMode: defaultMode } as const;
		if (next === "pickup") {
			onChange(
				{
					...base,
					type: "collect_item",
					itemId: project.items[0]?.id ?? "",
					quantity: 1,
				},
				{ type: "none" },
			);
			return;
		}
		if (next === "container")
			onChange(
				{ ...base, type: "object_behaviour", prompt: "Open chest" },
				{ type: "container", once: true, contents: [] },
			);
		else if (next === "door")
			onChange(
				{ ...base, type: "object_behaviour", prompt: "Enter" },
				{ type: "door" },
			);
		else if (next === "flag")
			onChange(
				{ ...base, type: "set_flag", flag: "", value: true },
				kind === "object" ? { type: "none" } : undefined,
			);
		else if (next === "transition")
			onChange({
				...base,
				type: "teleport",
				prompt: "Enter",
				targetAreaId: project.activeAreaId,
				targetEventBlockId: project.areas.find(
					(a) => a.id === project.activeAreaId,
				)?.eventBlocks[0]?.id,
			});
		else
			onChange(
				{
					...base,
					type: "show_message",
					prompt: kind === "npc" ? "Talk" : "Examine",
					speaker: kind === "npc" ? name : "",
					lines: [""],
					once: kind === "event",
				},
				kind === "object" ? { type: "none" } : undefined,
			);
	}
	function patch(value: Partial<Interaction>) {
		onChange({
			type: "object_behaviour",
			activationMode: defaultMode,
			...interaction,
			...value,
		});
	}
	const container = behaviour?.type === "container" ? behaviour : undefined;
	const lines = interaction?.lines?.length ? interaction.lines : [""];
	const door = behaviour?.type === "door" ? behaviour : undefined;
	const targetArea = project.areas.find(
		(a) => a.id === (door?.targetAreaId ?? interaction?.targetAreaId),
	);
	function destination(value: {
		targetAreaId?: string;
		targetEventBlockId?: string;
	}) {
		if (door)
			onChange(
				interaction ?? {
					type: "object_behaviour",
					activationMode: defaultMode,
				},
				{ ...door, ...value },
			);
		else patch(value);
	}
	function reward(
		itemId: string,
		quantity = container?.contents[0]?.quantity ?? 1,
	) {
		if (container)
			onChange(
				interaction ?? {
					type: "object_behaviour",
					activationMode: defaultMode,
				},
				{ ...container, contents: itemId ? [{ itemId, quantity }] : [] },
			);
	}
	return (
		<section className="form-stack simple-interaction" aria-label="Interaction">
			<div className="panel-title secondary">Interaction</div>
			<label className="checkbox-row">
				<input
					type="checkbox"
					checked={enabled}
					onChange={(event) => {
						if (!interaction && !behaviour)
							choose(
								kind === "object" && /chest|container/i.test(name)
									? "container"
									: "message",
							);
						else if (!interaction && behaviour?.type === "none")
							choose(/chest|container/i.test(name) ? "container" : "message");
						else
							patch({
								activationMode: event.target.checked ? defaultMode : "disabled",
							});
					}}
				/>
				Enable interaction
			</label>
			{enabled && (
				<>
					<label>
						Interaction type
						<select
							value={type}
							onChange={(event) => choose(event.target.value)}
						>
							<option value="message">
								{kind === "npc"
									? "Dialogue"
									: kind === "event"
										? "Trigger / Message"
										: "Examine / Message"}
							</option>
							{kind === "object" && (
								<>
									<option value="container">Container</option>
									<option value="door">Door / Transition</option>
									<option value="pickup">Pickup</option>
								</>
							)}
							{kind === "event" && (
								<>
									<option value="flag">Trigger / Set flag</option>
									<option value="transition">Trigger / Transition</option>
								</>
							)}
							{type === "advanced" && (
								<option value="advanced">
									Existing interaction (advanced)
								</option>
							)}
						</select>
					</label>
					{type !== "advanced" && (
						<>
							{type === "pickup" && (
								<>
									<label>
										Pickup item
										<select
											value={interaction?.itemId ?? ""}
											onChange={(e) => patch({ itemId: e.target.value })}
										>
											<option value="">Choose an item</option>
											{project.items.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									<label>
										Pickup quantity
										<input
											type="number"
											min={1}
											step={1}
											value={interaction?.quantity ?? 1}
											onChange={(e) =>
												patch({
													quantity: Math.max(
														1,
														Math.floor(Number(e.target.value) || 1),
													),
												})
											}
										/>
									</label>
									<p className="muted">
										Collect with Interact. This object disappears for the
										current Play session. Create item definitions in Items;
										placed item pickups also support touch collection.
									</p>
									{!interaction?.itemId && (
										<p className="validation-message">
											Choose an item before playing.
										</p>
									)}
								</>
							)}
							{kind !== "event" && (
								<label>
									Prompt label
									<input
										value={interaction?.prompt ?? ""}
										placeholder={kind === "npc" ? "Talk" : "Examine"}
										onChange={(e) => patch({ prompt: e.target.value })}
									/>
								</label>
							)}
							{kind === "event" && (
								<p className="muted">
									Fires when the player enters this cell. Hidden in Play.
								</p>
							)}
							{type === "message" && (
								<>
									{!lines.some((line) => line.trim()) && (
										<p className="muted">
											Add text to show when this interaction runs.
										</p>
									)}
									{kind === "npc" && (
										<label>
											Speaker
											<input
												value={interaction?.speaker ?? ""}
												onChange={(e) => patch({ speaker: e.target.value })}
											/>
										</label>
									)}
									{lines.map((line, index) => (
										<label key={line}>
											{kind === "npc"
												? `Dialogue line ${index + 1}`
												: "Message text"}
											<textarea
												rows={3}
												value={line}
												onChange={(e) =>
													patch({
														lines: lines.map((text, i) =>
															i === index ? e.target.value : text,
														),
													})
												}
											/>
											{(interaction?.lines?.length ?? 0) > 1 && (
												<button
													type="button"
													onClick={() =>
														patch({
															lines: interaction?.lines?.filter(
																(_, i) => i !== index,
															),
														})
													}
												>
													Remove line {index + 1}
												</button>
											)}
										</label>
									))}
									{kind === "npc" && (
										<button
											type="button"
											onClick={() =>
												patch({ lines: [...(interaction?.lines ?? []), ""] })
											}
										>
											Add dialogue line
										</button>
									)}
									{kind === "event" && (
										<label className="checkbox-row">
											<input
												type="checkbox"
												checked={interaction?.once ?? false}
												onChange={(e) => patch({ once: e.target.checked })}
											/>
											Once per Play session
										</label>
									)}
								</>
							)}
							{container && (
								<>
									<label>
										Reward item
										<select
											value={container.contents[0]?.itemId ?? ""}
											onChange={(e) => reward(e.target.value)}
										>
											<option value="">No item reward</option>
											{project.items.map((item) => (
												<option key={item.id} value={item.id}>
													{item.name}
												</option>
											))}
										</select>
									</label>
									{container.contents.length > 1 && (
										<p className="muted">
											This legacy container has multiple rewards. Changing the
											reward here replaces them with one item; advanced settings
											retain the full list.
										</p>
									)}
									{container.contents.length > 0 && (
										<label>
											Reward quantity
											<input
												type="number"
												min={1}
												step={1}
												value={container.contents[0].quantity}
												onChange={(e) =>
													reward(
														container.contents[0].itemId,
														Math.max(
															1,
															Math.floor(Number(e.target.value) || 1),
														),
													)
												}
											/>
										</label>
									)}
									<details>
										<summary>Create reward item</summary>
										<label>
											New item name
											<input
												value={newItemName}
												onChange={(e) => setNewItemName(e.target.value)}
											/>
										</label>
										<button
											type="button"
											disabled={!newItemName.trim()}
											onClick={() => {
												reward(onCreateItem(newItemName.trim()));
												setNewItemName("");
											}}
										>
											Create item and use
										</button>
									</details>
									<p className="muted">
										{container.once
											? "Opens once per Play session."
											: "This existing container repeats its reward. Change Once in advanced behaviour to limit it."}
									</p>
								</>
							)}
							{(door || type === "transition") && (
								<>
									<label>
										Destination area
										<select
											value={targetArea?.id ?? ""}
											onChange={(e) =>
												destination({
													targetAreaId: e.target.value,
													targetEventBlockId: project.areas.find(
														(a) => a.id === e.target.value,
													)?.eventBlocks[0]?.id,
												})
											}
										>
											<option value="">Select area</option>
											{project.areas.map((area) => (
												<option key={area.id} value={area.id}>
													{area.name}
												</option>
											))}
										</select>
									</label>
									<label>
										Arrival point
										<select
											value={
												door?.targetEventBlockId ??
												interaction?.targetEventBlockId ??
												""
											}
											onChange={(e) =>
												destination({ targetEventBlockId: e.target.value })
											}
										>
											<option value="">Select event point</option>
											{targetArea?.eventBlocks.map((block) => (
												<option key={block.id} value={block.id}>
													{block.name}
												</option>
											))}
										</select>
									</label>
									{door && (
										<label>
											Required item
											<select
												value={door.requiredItemId ?? ""}
												onChange={(e) =>
													onChange(
														interaction ?? {
															type: "object_behaviour",
															activationMode: defaultMode,
														},
														{
															...door,
															requiredItemId: e.target.value || undefined,
														},
													)
												}
											>
												<option value="">No requirement</option>
												{project.items.map((item) => (
													<option key={item.id} value={item.id}>
														{item.name}
													</option>
												))}
											</select>
										</label>
									)}
									{!targetArea && (
										<p className="validation-message">
											Choose a destination and an arrival event point.
										</p>
									)}
								</>
							)}
							{type === "flag" && (
								<>
									<label>
										Flag name
										<input
											value={interaction?.flag ?? ""}
											onChange={(e) => patch({ flag: e.target.value })}
										/>
									</label>
									<label>
										Flag value
										<select
											value={String(interaction?.value ?? true)}
											onChange={(e) =>
												patch({ value: e.target.value === "true" })
											}
										>
											<option value="true">True</option>
											<option value="false">False</option>
										</select>
									</label>
								</>
							)}
						</>
					)}
				</>
			)}
		</section>
	);
}
