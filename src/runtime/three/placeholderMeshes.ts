import * as THREE from "three";
import type {
	Interaction,
	NPCAttributes,
	ObjectBehaviour,
	ObjectDefinition,
} from "../../types/game";
import {
	createWorldMaterial,
	getWorldMaterialColor,
} from "./worldPresentation";

export type PlaceholderVisualType =
	| "tree"
	| "house"
	| "marketStall"
	| "boat"
	| "chest"
	| "sign"
	| "door"
	| "rock"
	| "pickup"
	| "npc"
	| "hostileNpc"
	| "genericObject"
	| "event";

export type PlaceholderVisualEntity =
	| {
			kind: "object";
			name?: string;
			category?: ObjectDefinition["category"];
			behaviour?: ObjectBehaviour;
			interaction?: Interaction;
	  }
	| {
			kind: "structure";
			name?: string;
			structureId?: string;
	  }
	| {
			kind: "npc";
			name?: string;
			attributes?: Pick<NPCAttributes, "alignment">;
			enemyEnabled?: boolean;
	  }
	| { kind: "pickup"; name?: string }
	| { kind: "event"; name?: string };

export type PlaceholderSelectionMetadata = {
	entityType: string;
	entityId?: string;
	areaId?: string;
	x?: number;
	y?: number;
};

export type PlaceholderMarkerInput = {
	visualType: PlaceholderVisualType;
	color: number;
	depth: number;
	height: number;
	opacity: number;
	threeX: number;
	threeY: number;
	threeZ: number;
	width: number;
};

export type PlaceholderMeshOptions = {
	metadata?: PlaceholderSelectionMetadata;
	selected?: boolean;
};

export const PLACEHOLDER_MATERIAL_COLORS = {
	foliage: getWorldMaterialColor("foliage"),
	friendly: getWorldMaterialColor("friendly"),
	hostile: getWorldMaterialColor("hostile"),
	houseWall: getWorldMaterialColor("houseWall"),
	itemAccent: getWorldMaterialColor("itemAccent"),
	marketCanopy: getWorldMaterialColor("marketCanopy"),
	neutral: getWorldMaterialColor("default"),
	roof: getWorldMaterialColor("roof"),
	skin: getWorldMaterialColor("skin"),
	stone: getWorldMaterialColor("stone"),
	waterAccent: getWorldMaterialColor("waterAccent"),
	wood: getWorldMaterialColor("wood"),
} as const;

function textIncludes(text: string | undefined, fragments: string[]): boolean {
	const value = text?.toLowerCase() ?? "";
	return fragments.some((fragment) => value.includes(fragment));
}

function isShopInteraction(interaction: Interaction | undefined): boolean {
	return interaction?.type === "open_shop";
}

export function resolvePlaceholderVisualType(
	entity: PlaceholderVisualEntity,
): PlaceholderVisualType {
	if (entity.kind === "pickup") {
		return "pickup";
	}
	if (entity.kind === "event") {
		return "event";
	}
	if (entity.kind === "npc") {
		return entity.attributes?.alignment === "hostile" || entity.enemyEnabled
			? "hostileNpc"
			: "npc";
	}
	if (entity.kind === "structure") {
		if (
			textIncludes(`${entity.name ?? ""} ${entity.structureId ?? ""}`, ["tree"])
		) {
			return "tree";
		}
		if (
			textIncludes(`${entity.name ?? ""} ${entity.structureId ?? ""}`, [
				"rock",
				"stone",
				"boulder",
			])
		) {
			return "rock";
		}
		return "house";
	}

	const label = entity.name ?? "";
	if (
		entity.category === "vehicle" ||
		entity.behaviour?.type === "vehicle" ||
		textIncludes(label, ["boat"])
	) {
		return "boat";
	}
	if (
		entity.category === "container" ||
		entity.behaviour?.type === "container"
	) {
		return "chest";
	}
	if (entity.category === "sign" || entity.behaviour?.type === "sign") {
		return "sign";
	}
	if (entity.category === "door" || entity.behaviour?.type === "door") {
		return "door";
	}
	if (
		isShopInteraction(entity.interaction) ||
		textIncludes(label, ["market", "shop", "stall"])
	) {
		return "marketStall";
	}
	if (textIncludes(label, ["tree", "oak", "pine"])) {
		return "tree";
	}
	if (textIncludes(label, ["rock", "stone", "boulder"])) {
		return "rock";
	}
	return "genericObject";
}

function makeMaterial(
	color: number,
	{ opacity = 1, selected = false } = {},
): THREE.MeshStandardMaterial {
	return createWorldMaterial("default", {
		color,
		opacity,
		selected,
	});
}

function makeBox(
	width: number,
	height: number,
	depth: number,
	color: number,
	options: { opacity?: number; selected?: boolean } = {},
): THREE.Mesh {
	return new THREE.Mesh(
		new THREE.BoxGeometry(width, height, depth),
		makeMaterial(color, options),
	);
}

function makeCylinder(
	radiusTop: number,
	radiusBottom: number,
	height: number,
	color: number,
	options: {
		opacity?: number;
		radialSegments?: number;
		selected?: boolean;
	} = {},
): THREE.Mesh {
	return new THREE.Mesh(
		new THREE.CylinderGeometry(
			radiusTop,
			radiusBottom,
			height,
			options.radialSegments ?? 14,
		),
		makeMaterial(color, options),
	);
}

function makeSphere(
	radius: number,
	color: number,
	options: { opacity?: number; selected?: boolean } = {},
): THREE.Mesh {
	return new THREE.Mesh(
		new THREE.SphereGeometry(radius, 14, 10),
		makeMaterial(color, options),
	);
}

function makeCone(
	radius: number,
	height: number,
	color: number,
	options: {
		opacity?: number;
		radialSegments?: number;
		selected?: boolean;
	} = {},
): THREE.Mesh {
	return new THREE.Mesh(
		new THREE.ConeGeometry(radius, height, options.radialSegments ?? 14),
		makeMaterial(color, options),
	);
}

function addPart(
	group: THREE.Group,
	mesh: THREE.Mesh,
	x: number,
	y: number,
	z: number,
): void {
	mesh.position.set(x, y, z);
	group.add(mesh);
}

function getBaseY(marker: PlaceholderMarkerInput): number {
	return Math.max(0, marker.threeY - marker.height / 2);
}

function buildTree(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	const trunkHeight = Math.max(0.48, marker.height * 0.38);
	addPart(
		group,
		makeCylinder(0.08, 0.1, trunkHeight, PLACEHOLDER_MATERIAL_COLORS.wood, {
			selected,
		}),
		0,
		trunkHeight / 2,
		0,
	);
	addPart(
		group,
		makeCone(
			Math.min(marker.width, marker.depth) * 0.48,
			Math.max(0.7, marker.height * 0.62),
			PLACEHOLDER_MATERIAL_COLORS.foliage,
			{ selected },
		),
		0,
		trunkHeight + Math.max(0.7, marker.height * 0.62) / 2 - 0.08,
		0,
	);
}

function buildHouse(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	const baseHeight = marker.height * 0.62;
	addPart(
		group,
		makeBox(
			marker.width,
			baseHeight,
			marker.depth,
			PLACEHOLDER_MATERIAL_COLORS.houseWall,
			{ selected },
		),
		0,
		baseHeight / 2,
		0,
	);
	addPart(
		group,
		makeCone(
			Math.max(marker.width, marker.depth) * 0.68,
			marker.height * 0.45,
			PLACEHOLDER_MATERIAL_COLORS.roof,
			{ radialSegments: 4, selected },
		),
		0,
		baseHeight + (marker.height * 0.45) / 2,
		0,
	);
}

function buildMarketStall(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeBox(
			marker.width * 0.78,
			0.24,
			marker.depth * 0.58,
			PLACEHOLDER_MATERIAL_COLORS.wood,
			{ selected },
		),
		0,
		0.32,
		0,
	);
	addPart(
		group,
		makeBox(
			marker.width,
			0.16,
			marker.depth * 0.82,
			PLACEHOLDER_MATERIAL_COLORS.marketCanopy,
			{ selected },
		),
		0,
		0.92,
		0,
	);
	[-0.38, 0.38].forEach((x) => {
		addPart(
			group,
			makeCylinder(0.035, 0.035, 0.8, PLACEHOLDER_MATERIAL_COLORS.wood, {
				selected,
			}),
			x * marker.width,
			0.55,
			-marker.depth * 0.28,
		);
	});
}

function buildBoat(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeBox(
			Math.max(0.95, marker.width * 0.9),
			0.22,
			Math.max(0.42, marker.depth * 0.62),
			PLACEHOLDER_MATERIAL_COLORS.waterAccent,
			{ opacity: marker.opacity, selected },
		),
		0,
		0.16,
		0,
	);
	addPart(
		group,
		makeBox(
			Math.max(0.7, marker.width * 0.55),
			0.12,
			Math.max(0.28, marker.depth * 0.36),
			getWorldMaterialColor("water"),
			{ opacity: marker.opacity, selected },
		),
		0,
		0.36,
		0,
	);
}

function buildChest(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeBox(
			marker.width * 0.72,
			0.38,
			marker.depth * 0.62,
			PLACEHOLDER_MATERIAL_COLORS.wood,
			{ selected },
		),
		0,
		0.22,
		0,
	);
	addPart(
		group,
		makeBox(
			marker.width * 0.78,
			0.14,
			marker.depth * 0.68,
			PLACEHOLDER_MATERIAL_COLORS.itemAccent,
			{ selected },
		),
		0,
		0.5,
		0,
	);
}

function buildSign(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeCylinder(0.035, 0.045, 0.8, PLACEHOLDER_MATERIAL_COLORS.wood, {
			selected,
		}),
		0,
		0.4,
		0,
	);
	addPart(
		group,
		makeBox(marker.width * 0.78, 0.28, 0.08, PLACEHOLDER_MATERIAL_COLORS.wood, {
			selected,
		}),
		0,
		0.72,
		0,
	);
}

function buildDoor(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeBox(
			Math.max(0.34, marker.width * 0.46),
			Math.max(0.76, marker.height),
			0.08,
			PLACEHOLDER_MATERIAL_COLORS.wood,
			{ selected },
		),
		0,
		Math.max(0.76, marker.height) / 2,
		0,
	);
}

function buildRock(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeSphere(
			Math.min(marker.width, marker.depth) * 0.38,
			PLACEHOLDER_MATERIAL_COLORS.stone,
			{ opacity: marker.opacity, selected },
		),
		0,
		Math.min(marker.width, marker.depth) * 0.32,
		0,
	);
}

function buildPickup(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeSphere(0.16, PLACEHOLDER_MATERIAL_COLORS.itemAccent, {
			opacity: marker.opacity,
			selected,
		}),
		0,
		0.22,
		0,
	);
	addPart(
		group,
		makeBox(0.22, 0.05, 0.22, getWorldMaterialColor("sand"), { selected }),
		0,
		0.06,
		0,
	);
}

function buildNpc(group: THREE.Group, selected: boolean, hostile: boolean) {
	const bodyColor = hostile
		? PLACEHOLDER_MATERIAL_COLORS.hostile
		: PLACEHOLDER_MATERIAL_COLORS.friendly;
	addPart(
		group,
		makeCylinder(0.18, 0.22, 0.72, bodyColor, { selected }),
		0,
		0.44,
		0,
	);
	addPart(
		group,
		makeSphere(0.19, PLACEHOLDER_MATERIAL_COLORS.skin, { selected }),
		0,
		0.92,
		0,
	);
	if (hostile) {
		addPart(
			group,
			makeCone(0.15, 0.24, PLACEHOLDER_MATERIAL_COLORS.hostile, {
				selected,
			}),
			0,
			1.16,
			0,
		);
	}
}

function buildGeneric(
	group: THREE.Group,
	marker: PlaceholderMarkerInput,
	selected: boolean,
) {
	addPart(
		group,
		makeBox(marker.width, marker.height, marker.depth, marker.color, {
			opacity: marker.opacity,
			selected,
		}),
		0,
		marker.height / 2,
		0,
	);
}

export function applyPlaceholderMetadata(
	object: THREE.Object3D,
	metadata: PlaceholderSelectionMetadata,
): void {
	object.userData.selectionMetadata = metadata;
	object.traverse((child) => {
		child.userData.selectionMetadata = metadata;
	});
}

export function getPlaceholderSelectableObjects(
	object: THREE.Object3D,
): THREE.Object3D[] {
	const selectable: THREE.Object3D[] = [];
	object.traverse((child) => {
		if (child !== object && child.userData.selectionMetadata) {
			selectable.push(child);
		}
	});
	return selectable;
}

export function createPlaceholderMeshGroup(
	marker: PlaceholderMarkerInput,
	options: PlaceholderMeshOptions = {},
): THREE.Group {
	const group = new THREE.Group();
	const selected = options.selected ?? false;
	group.position.set(marker.threeX, getBaseY(marker), marker.threeZ);

	if (marker.visualType === "tree") {
		buildTree(group, marker, selected);
	} else if (marker.visualType === "house") {
		buildHouse(group, marker, selected);
	} else if (marker.visualType === "marketStall") {
		buildMarketStall(group, marker, selected);
	} else if (marker.visualType === "boat") {
		buildBoat(group, marker, selected);
	} else if (marker.visualType === "chest") {
		buildChest(group, marker, selected);
	} else if (marker.visualType === "sign") {
		buildSign(group, marker, selected);
	} else if (marker.visualType === "door") {
		buildDoor(group, marker, selected);
	} else if (marker.visualType === "rock") {
		buildRock(group, marker, selected);
	} else if (marker.visualType === "pickup") {
		buildPickup(group, marker, selected);
	} else if (
		marker.visualType === "npc" ||
		marker.visualType === "hostileNpc"
	) {
		buildNpc(group, selected, marker.visualType === "hostileNpc");
	} else {
		buildGeneric(group, marker, selected);
	}

	if (options.metadata) {
		applyPlaceholderMetadata(group, options.metadata);
	}

	return group;
}

export function disposePlaceholderObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		const mesh = child as THREE.Mesh;
		if (mesh.geometry) {
			mesh.geometry.dispose();
		}
		if (Array.isArray(mesh.material)) {
			mesh.material.forEach((material) => {
				material.dispose();
			});
		} else if (mesh.material) {
			mesh.material.dispose();
		}
	});
}
