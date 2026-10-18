import { describe, expect, it, vi } from "vitest";
import { createProjectFromPreset } from "../data/projectPresets";
import type { DialogueDefinition, GameProject } from "../types/game";
import { AdventureScene } from "./AdventureScene";
import { createGameSave, type GameSave } from "./gameSave";
import type { RuntimeSessionState } from "./runtimeSession";
import { createRuntimeSession } from "./runtimeSession";

vi.mock("phaser", () => ({
	default: {
		Scene: class {},
		Input: {
			Events: { POINTER_DOWN: "pointerdown" },
			Keyboard: { Events: { ANY_KEY_DOWN: "keydown" } },
		},
	},
}));

function project(): GameProject {
	const value = createProjectFromPreset("blank");
	value.areas[0].width = 3;
	value.areas[0].height = 3;
	value.areas[0].terrainTiles = Array.from({ length: 9 }, (_, i) => ({
		x: i % 3,
		y: Math.floor(i / 3),
		tileId: "grass",
	}));
	value.player.canWalkOn = ["grass"];
	value.player.speed = 6;
	value.progression = [];
	return value;
}

type Boundary = {
	session: RuntimeSessionState;
	showDialogue(dialogue: DialogueDefinition): void;
	playerMarker: unknown;
	isCutsceneOpen: boolean;
	isDialogueOpen: boolean;
	isFinished: boolean;
	add: unknown;
	tweens: unknown;
	scale: { width: number; height: number };
	createPixelTextures(): void;
	renderMap(): void;
	configureCameras(): void;
	createInput(): void;
	spawnPlayer(): void;
	updateDebugPanel(): void;
	updateNpcMovement(time: number): void;
	findNearestInteractable(): null;
	updatePrompt(): void;
	wasInteractPressed(): boolean;
	wasAttackPressed(): boolean;
	checkTouchInteractions: () => boolean;
	checkTrigger: () => void;
	readDirection(): { x: number; y: number } | null;
};

function harness(authored = project(), saved?: GameSave) {
	const scene = new AdventureScene(
		authored,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		saved,
	);
	const boundary = scene as unknown as Boundary;
	const buttons = new Map<string, () => void>();
	const texts: string[] = [];
	const drawable = {
		add: vi.fn(),
		destroy: vi.fn(),
		setDepth() {
			return this;
		},
		setScrollFactor() {
			return this;
		},
		setOrigin() {
			return this;
		},
		setText() {
			return this;
		},
		setStrokeStyle() {
			return this;
		},
		setInteractive() {
			return this;
		},
	};
	boundary.add = {
		container: () => drawable,
		rectangle: () => drawable,
		text: (_x: number, _y: number, text: string) => {
			texts.push(text);
			return {
				...drawable,
				on: (_event: string, callback: () => void) =>
					buttons.set(text, callback),
			};
		},
	};
	boundary.scale = { width: 800, height: 600 };
	boundary.playerMarker = drawable;
	boundary.tweens = { add: vi.fn() }; // No tween completion: gameplay clocks must be authoritative.
	boundary.createPixelTextures = vi.fn();
	boundary.renderMap = vi.fn();
	boundary.configureCameras = vi.fn();
	boundary.createInput = vi.fn();
	boundary.spawnPlayer = vi.fn();
	boundary.updateDebugPanel = vi.fn();
	boundary.updateNpcMovement = vi.fn();
	boundary.findNearestInteractable = () => null;
	boundary.updatePrompt = vi.fn();
	boundary.wasInteractPressed = () => false;
	boundary.wasAttackPressed = () => false;
	boundary.readDirection = () => ({ x: 1, y: 0 });
	return { scene, boundary, buttons, texts };
}

describe("Phaser gameplay boundary", () => {
	it("pauses gameplay for inventory, resumes on close, and refuses it during dialogue", () => {
		const { scene, boundary } = harness();
		scene.create();
		boundary.checkTouchInteractions = vi.fn(() => false);
		boundary.checkTrigger = vi.fn();
		expect(scene.setInventoryOpen(true)).toBe(true);
		scene.update(1000);
		expect(boundary.session.playerPosition).toEqual({ x: 0, y: 0 });
		expect(boundary.updateNpcMovement).not.toHaveBeenCalled();
		expect(scene.setInventoryOpen(false)).toBe(true);
		scene.update(1000);
		expect(boundary.session.playerPosition).toEqual({ x: 1, y: 0 });
		boundary.isDialogueOpen = true;
		expect(scene.setInventoryOpen(true)).toBe(false);
	});
	it("uses the same movement deadline even if the presentation tween has not completed", () => {
		const { scene, boundary } = harness();
		scene.create();
		boundary.checkTouchInteractions = vi.fn(() => false);
		boundary.checkTrigger = vi.fn();
		scene.update(1000);
		scene.update(1000);
		expect(boundary.checkTouchInteractions).toHaveBeenCalledTimes(1);
		expect(boundary.checkTrigger).toHaveBeenCalledTimes(1);
		expect(boundary.session.playerPosition).toEqual({ x: 1, y: 0 });
		scene.update(1216);
		expect(boundary.session.playerPosition).toEqual({ x: 2, y: 0 });
	});
	it.each([
		"isCutsceneOpen",
		"isDialogueOpen",
		"isFinished",
		"shop",
	] as const)("blocks gameplay input during %s", (blocker) => {
		const { scene, boundary } = harness();
		scene.create();
		if (blocker === "shop") boundary.session.activeShopId = "shop";
		else boundary[blocker] = true;
		boundary.wasAttackPressed = () => true;
		scene.update(1000);
		expect(boundary.session.nextAttackAt).toBe(0);
		expect(boundary.session.playerPosition).toEqual({ x: 0, y: 0 });
	});
	it("does not mark the editor-active area entered before progression spawns elsewhere", () => {
		const authored = project();
		const edited = authored.areas[0];
		authored.areas.push({
			...structuredClone(edited),
			id: "spawn",
			eventBlocks: [
				{ id: "entry", name: "Entry", tag: "", kind: "spawn", x: 1, y: 1 },
			],
		});
		authored.progression = [
			{
				id: "spawn",
				action: {
					type: "spawn_player",
					areaId: "spawn",
					eventBlockId: "entry",
				},
			},
		];
		authored.items = [
			{ id: "coin", name: "Coin", category: "currency", stackable: true },
		];
		authored.quests = [edited.id, "spawn"].map((areaId) => ({
			id: areaId,
			name: areaId,
			status: "active",
			objectives: [
				{
					id: "visit",
					description: "Visit",
					condition: { type: "enter_area", areaId },
				},
			],
			rewards: [
				{
					type: "item",
					itemId: "coin",
					quantity: areaId === "spawn" ? 1 : 100,
				},
			],
		}));
		authored.rules = [
			{
				id: "entered",
				name: "Entered",
				enabled: true,
				runPolicy: "always",
				trigger: { type: "on_area_enter", areaId: "spawn" },
				actions: [
					{ type: "change_variable", variable: "entry_count", amount: 1 },
				],
			},
		];
		const { scene, boundary } = harness(authored);
		scene.create();
		expect(boundary.session.currentAreaId).toBe("spawn");
		expect(boundary.session.runtimeState.inventory.items.coin).toBe(1);
		expect(boundary.session.runtimeState.variables.entry_count).toBe(1);
		expect(boundary.session.runtimeQuestState.enteredAreaIds).toEqual(
			new Set(["spawn"]),
		);
	});
});

describe("Phaser dialogue and combat", () => {
	it("renders authored nodes and choice effects, then resumes gameplay", () => {
		const { scene, boundary, buttons, texts } = harness();
		scene.create();
		boundary.showDialogue({
			id: "talk",
			name: "Talk",
			startNodeId: "hello",
			nodes: [
				{ id: "hello", type: "text", text: "Hello", nextNodeId: "choice" },
				{
					id: "choice",
					type: "choice",
					text: "Choose",
					choices: [{ id: "yes", text: "Yes", targetNodeId: "end" }],
				},
				{
					id: "end",
					type: "end",
					text: "Thanks",
					actions: [{ type: "set_flag", flag: "agreed", value: true }],
				},
			],
		});
		expect(texts).toContain("Hello");
		buttons.get("Next")!();
		expect(texts).toContain("Choose");
		buttons.get("1. Yes")!();
		expect(texts).toContain("Thanks");
		expect(boundary.session.runtimeState.flags.agreed).toBe(true);
		buttons.get("End conversation")!();
		expect(boundary.session.dialogue).toBeUndefined();
		scene.update(1000);
		expect(boundary.session.playerPosition).toEqual({ x: 1, y: 0 });
	});
	it("lets a conversation with no available choices close safely", () => {
		const { scene, boundary, buttons } = harness();
		scene.create();
		boundary.showDialogue({
			id: "talk",
			name: "Talk",
			startNodeId: "choice",
			nodes: [
				{
					id: "choice",
					type: "choice",
					text: "Nothing available",
					choices: [],
				},
			],
		});
		expect(buttons.has("End conversation")).toBe(true);
		buttons.get("End conversation")!();
		expect(boundary.session.dialogue).toBeUndefined();
	});
	it("preserves attack cooldown and resumes after a shop closes", () => {
		const { scene, boundary } = harness();
		scene.create();
		boundary.wasAttackPressed = () => true;
		scene.update(1000);
		const deadline = boundary.session.nextAttackAt;
		expect(deadline).toBeGreaterThan(1000);
		scene.update(deadline - 1);
		expect(boundary.session.nextAttackAt).toBe(deadline);
		boundary.session.activeShopId = "shop";
		scene.update(deadline);
		expect(boundary.session.nextAttackAt).toBe(deadline);
		boundary.session.activeShopId = undefined;
		scene.update(deadline);
		expect(boundary.session.nextAttackAt).toBeGreaterThan(deadline);
	});
});

it("Phaser restores the saved area/position and bypasses startup effects", () => {
	const authored = project();
	const second = JSON.parse(JSON.stringify(authored.areas[0]));
	second.id = "second";
	authored.areas.push(second);
	authored.rules = [
		{
			id: "startup",
			name: "Startup",
			enabled: true,
			trigger: { type: "on_game_start" },
			actions: [{ type: "set_variable", variable: "counter", value: 0 }],
		},
	];
	const session = createRuntimeSession(authored);
	session.currentAreaId = "second";
	session.playerPosition = { x: 2, y: 1 };
	session.runtimeState.variables.counter = 12;
	const saved = createGameSave(authored, session);
	const { scene, boundary } = harness(authored, saved);
	scene.create();
	expect(boundary.spawnPlayer).toHaveBeenCalledWith({ x: 2, y: 1 });
	expect(boundary.session.currentAreaId).toBe("second");
	expect(scene.getSaveSession().runtimeState.variables.counter).toBe(12);
	boundary.isCutsceneOpen = true;
	expect(() => scene.getSaveSession()).toThrow(/before saving/);
});
