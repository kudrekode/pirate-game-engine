export const THREE_PLACEHOLDER_VISUAL_TYPES = [
	"tree",
	"house",
	"marketStall",
	"boat",
	"chest",
	"sign",
	"door",
	"rock",
	"pickup",
	"player",
	"npc",
	"hostileNpc",
	"genericObject",
	"event",
] as const;

export type ThreePlaceholderVisualType =
	(typeof THREE_PLACEHOLDER_VISUAL_TYPES)[number];

export type ThreeVisualConfig = {
	mode?: "placeholder" | "asset";
	placeholderType?: ThreePlaceholderVisualType;
	assetId?: string;
	scale?: number;
	heightOffset?: number;
	rotationOffset?: number;
};

// Instance-owned transforms. X/Z offsets stay relative to integer gameplay
// anchors; profiled world assets also use these transforms for runtime traversal.
export type MapEntityTransform = {
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number };
	scale: { x: number; y: number; z: number };
};

export type MapCollisionProfile =
	| "none"
	| "solid"
	| "walkable-floor"
	| "trigger";

export type MapSceneAppearance = {
	hidden?: boolean;
	locked?: boolean;
	group?: string;
	collision?: MapCollisionProfile;
};

export type GameProject = {
	storyGraphs?: StoryGraph[];
	characterAssets?: CharacterGameAsset[];
	assetCreator?: AssetCreatorLibrary;
	foliageBrush?: FoliageBrushSettings;
	metadata: ProjectMetadata;
	areas: GameArea[];
	activeAreaId: string;
	camera: CameraConfig;
	tileStyles: TileStyleConfig;
	pixelAssets: Record<string, PixelAsset>;
	player: PlayerConfig;
	cutscenes: Cutscene[];
	dialogues: DialogueDefinition[];
	progression: ProgressionStep[];
	gameState: GameStateConfig;
	items: ItemDefinition[];
	shops: ShopDefinition[];
	quests: Quest[];
	trackedQuestId?: string;
	npcs: NPCDefinition[];
	objects: ObjectDefinition[];
	ruleGroups: RuleGroup[];
	rules: GameRule[];
};

export type StoryMapTarget = {
	type: "eventBlock" | "object" | "structure" | "pickup" | "npc";
	id: string;
};

export type StoryMapPosition = {
	areaId: string;
	x: number;
	y: number;
	target?: StoryMapTarget;
};

export type StoryNodeData = {
	newGame: Record<string, never>;
	areaEnter: { areaId: string };
	questStart: { questId: string };
	questComplete: { questId: string };
	flagChanged: { flagId: string };
	mapEvent: { areaId: string; eventBlockId: string };
	waitNpc: { areaId: string; npcId: string };
	waitLocation: StoryMapPosition & { radius: number };
	waitItem: { itemId: string };
	waitEnemy: { areaId: string; npcId: string };
	waitDialogueChoice: { dialogueId: string; nodeId: string; choiceId: string };
	waitCinematic: { cinematicId: string };
	delay: { seconds: number };
	spawn: StoryMapPosition;
	cinematic: { cinematicId: string };
	startQuest: { questId: string };
	completeQuest: { questId: string };
	objective: { questId: string; objectiveId: string };
	notify: { message: string };
	setFlag: { flagId: string; value: boolean };
	setVariable: { variableId: string; value: GameStateValue };
	giveItem: { itemId: string; quantity: number };
	teleport: StoryMapPosition;
	hasItem: { itemId: string; quantity: number };
	questState: { questId: string; status: QuestStatus };
	flagSet: { flagId: string };
	compareVariable: {
		variableId: string;
		operator: VariableComparisonOperator;
		value: GameStateValue;
	};
	inArea: { areaId: string };
	once: Record<string, never>;
	end: Record<string, never>;
};

export type StoryNodeKind = keyof StoryNodeData;
export type StoryNode = {
	[K in StoryNodeKind]: {
		id: string;
		x: number;
		y: number;
		title?: string;
		type: K;
		data: StoryNodeData[K];
	};
}[StoryNodeKind];
export type StoryEdge = {
	id: string;
	from: string;
	to: string;
	port: "next" | "true" | "false";
};
export type StoryGraph = {
	id: string;
	name: string;
	kind: "opening" | "quest" | "event";
	nodes: StoryNode[];
	edges: StoryEdge[];
};

export type FoliageBrushSettings = {
	palette: { assetId: string; weight: number }[];
	radius: number;
	density: number;
	spacing: number;
	seed: number;
	minScale: number;
	maxScale: number;
	rotationVariation: number;
	minHeight: number;
	maxHeight: number;
	maxSlope: number;
	excludeWater: boolean;
	excludeRoads: boolean;
};

export type AssetCreatorCategory =
	| "Humans"
	| "Animals"
	| "Buildings"
	| "Foliage"
	| "Props";
export type AssetCreatorVector = { x: number; y: number; z: number };
export type AssetCreatorAttachment = {
	assetId: string;
	socket: string;
	position: AssetCreatorVector;
	rotation: AssetCreatorVector;
	scale: number;
};

export type AssetCreatorVariant = {
	id: string;
	name: string;
	baseAssetId: string;
	forkedFromId?: string;
	category: AssetCreatorCategory;
	description: string;
	constraint: "Constrained" | "Extended" | "Custom";
	referenceImages: string[];
	tint?: string;
	scale: number;
	pose: Record<string, AssetCreatorVector>;
	attachment?: AssetCreatorAttachment;
	effectId?: string;
};

export type AssetCreatorClip = {
	id: string;
	name: string;
	sourceAssetId: string;
	sourceClipName: string;
	loop: boolean;
	keys: { bone: string; time: number; rotation: AssetCreatorVector }[];
};

export type AssetCreatorEffect = {
	id: string;
	name: string;
	type: "glow" | "fog" | "embers";
	color: string;
	intensity: number;
	duration: number;
	loop: boolean;
	socket?: string;
};

export type AssetCreatorLibrary = {
	variants: AssetCreatorVariant[];
	clips: AssetCreatorClip[];
	effects: AssetCreatorEffect[];
};

// Finalised source records only; renderer objects and preview URLs never enter a project.
export type CharacterGameAsset = {
	id: string;
	name: string;
	kind: "character";
	state: "finalised";
	geometryFamily: string;
	glbUrl: string;
	artifactHash: string;
	recipeHash: string;
	manifestUrl: string;
	recipeUrl: string;
	rigProfile: string;
	animationSet: string;
};

export type ProjectMetadata = {
	name: string;
	version: string;
};

export type GameAreaKind =
	| "outdoor"
	| "indoor"
	| "cave"
	| "ship"
	| "dungeon"
	| "custom";

export type AreaThemeConfig = {
	atmosphere?: "clear-day" | "golden-hour" | "overcast" | "moonlit";
	fog?: { enabled?: boolean; near?: number; far?: number };
	primaryTerrainId?: string;
	accentTerrainId?: string;
	overlayId?: string;
};

export type MovementMode = "walk" | "swim" | "sail" | "ride" | "drive";

export type MovementRule = {
	walkable?: boolean;
	movementMode?: MovementMode;
	speedMultiplier?: number;
};

export type MovementResult = {
	canMove: boolean;
	reason?: string;
	speedMultiplier: number;
	movementMode?: MovementMode;
};

export type PlayerVehicleState = {
	active: boolean;
	vehicleObjectInstanceId?: string;
	vehicleType?: "boat" | "horse" | "cart";
	movementMode?: "sail" | "ride" | "drive";
};

export type InteractionActivationMode =
	| "on_touch"
	| "on_interact"
	| "both"
	| "disabled";

export type InteractionType =
	| "show_message"
	| "object_behaviour"
	| "collect_item"
	| "area_link"
	| "teleport"
	| "play_cutscene"
	| "start_dialogue"
	| "open_shop"
	| "set_flag"
	| "change_movement_mode";

export type Interaction = {
	type: InteractionType;
	// Inline, ordered text uses the existing dialogue engine during Play.
	lines?: string[];
	itemId?: string;
	quantity?: number;
	speaker?: string;
	once?: boolean;
	// Runs through the shared action dispatcher after a successful interaction.
	completionActions?: GameAction[];
	activationMode: InteractionActivationMode;
	prompt?: string;
	targetAreaId?: string;
	targetEventBlockId?: string;
	cutsceneId?: string;
	dialogueId?: string;
	shopId?: string;
	flag?: string;
	value?: boolean;
	mode?: Exclude<MovementMode, "swim">;
};

export type EditorSelection =
	| { type: "eventBlock"; areaId: string; id: string }
	| { type: "structure"; areaId: string; id: string }
	| { type: "object"; areaId: string; id: string }
	| { type: "pickup"; areaId: string; id: string }
	| { type: "npc"; areaId: string; id: string }
	| { type: "overlay"; areaId: string; x: number; y: number }
	| { type: "terrain"; areaId: string; x: number; y: number }
	| { type: "area"; areaId: string }
	| null;

export type GameArea = {
	id: string;
	name: string;
	kind: GameAreaKind;
	width: number;
	height: number;
	tileSize: number;
	terrainTiles: MapTile[];
	terrainHeights?: TerrainHeightTile[];
	overlayTiles: OverlayTile[];
	structures: MapStructure[];
	objects: ObjectInstance[];
	pickups: PickupObject[];
	npcs: NPCInstance[];
	eventBlocks: EventBlock[];
	theme?: AreaThemeConfig;
};

export type GameMap = GameArea;

export type MapTile = {
	x: number;
	y: number;
	tileId: string;
};

export type TerrainHeightTile = {
	x: number;
	y: number;
	height: number;
};

export type OverlayTile = {
	x: number;
	y: number;
	overlayId: string;
};

export type MapStructure = {
	scene?: MapSceneAppearance;
	transform?: MapEntityTransform;
	id: string;
	structureId: string;
	name: string;
	x: number;
	y: number;
	widthTiles: number;
	heightTiles: number;
	blocksMovement: boolean;
	movementRule?: MovementRule;
	interaction?: Interaction;
};

export type ObjectDefinition = {
	id: string;
	name: string;
	description?: string;
	category:
		| "prop"
		| "container"
		| "vehicle"
		| "door"
		| "switch"
		| "sign"
		| "misc";
	iconId?: string;
	widthTiles: number;
	heightTiles: number;
	blocksMovement: boolean;
	defaultInteraction?: Interaction;
	defaultBehaviour?: ObjectBehaviour;
	threeVisual?: ThreeVisualConfig;
};

export type ObjectBehaviour =
	| { type: "none" }
	| {
			type: "container";
			contents: { itemId: string; quantity: number }[];
			once: boolean;
			openedFlag?: string;
	  }
	| {
			type: "door";
			targetAreaId?: string;
			targetEventBlockId?: string;
			requiredItemId?: string;
			lockedCutsceneId?: string;
	  }
	| { type: "sign"; text: string }
	| {
			type: "vehicle";
			vehicleType: "boat" | "horse" | "cart";
			movementMode: "sail" | "ride" | "drive";
			allowedTerrainIds: string[];
			allowedOverlayIds?: string[];
			dismountAllowedTerrainIds: string[];
			dismountAllowedOverlayIds?: string[];
			speedMultiplier?: number;
	  };

export type ObjectInstance = {
	scene?: MapSceneAppearance;
	transform?: MapEntityTransform;
	threeVisual?: ThreeVisualConfig;
	id: string;
	objectDefinitionId: string;
	areaId: string;
	x: number;
	y: number;
	nameOverride?: string;
	widthTiles?: number;
	heightTiles?: number;
	blocksMovement?: boolean;
	interaction?: Interaction;
	behaviourOverride?: ObjectBehaviour;
	state?: Record<string, boolean | number | string>;
};

export type PickupObject = {
	scene?: MapSceneAppearance;
	transform?: MapEntityTransform;
	id: string;
	itemId: string;
	quantity: number;
	areaId: string;
	x: number;
	y: number;
	pickupMode: "on_touch" | "on_interact";
	once: boolean;
	collectedFlag?: string;
};

export type NPCDefinition = {
	id: string;
	name: string;
	description?: string;
	mapAvatarId: string;
	portraitId?: string;
	defaultAttributes?: NPCAttributes;
	defaultMovement?: NPCMovementConfig;
	defaultEnemyBehaviour?: EnemyBehaviour;
	defaultInteraction?: Interaction;
	threeVisual?: ThreeVisualConfig;
};

export type NPCMovementMode = "stationary" | "patrol" | "wander";

export type PatrolPoint = {
	x: number;
	y: number;
};

export type PatrolPath = {
	points: PatrolPoint[];
	loop: boolean;
};

export type WanderZone = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type NPCAlignment = "friendly" | "neutral" | "hostile";

export type NPCAttributes = {
	maxHealth: number;
	health: number;
	faction: string;
	alignment: NPCAlignment;
	canInteract: boolean;
	movementSpeed?: number;
};

export type NPCMovementConfig = {
	movementMode: NPCMovementMode;
	movementSpeed?: number;
	patrolPath?: PatrolPath;
	wanderZone?: WanderZone;
};

export type EnemyBehaviour = {
	enabled: boolean;
	detectionRadiusTiles: number;
	chaseRadiusTiles: number;
	returnToOrigin: boolean;
	contactDamage?: number;
	/** Cycles in authored order. A nonempty list replaces legacy contact damage. */
	attacks?: EnemyAttack[];
};

export type EnemyAttack = {
	label: string;
	damage: number;
	rangeTiles: number;
	arcDegrees: number;
	windupMs: number;
	impactMs: number;
	recoveryMs: number;
	/** Optional names of embedded clips in the NPC's existing Three asset. */
	windupClip?: string;
	strikeClip?: string;
};

export type NPCInstance = {
	scene?: MapSceneAppearance;
	transform?: MapEntityTransform;
	nameOverride?: string;
	threeVisual?: ThreeVisualConfig;
	id: string;
	npcDefinitionId: string;
	areaId: string;
	x: number;
	y: number;
	facing?: "up" | "down" | "left" | "right";
	blocksMovement: boolean;
	movementMode: NPCMovementMode;
	attributes: NPCAttributes;
	// Legacy migration fallback. New edits use attributes.movementSpeed.
	movementSpeed?: number;
	patrolPath?: PatrolPath;
	wanderZone?: WanderZone;
	enemyBehaviour?: EnemyBehaviour;
	interaction?: Interaction;
	attributesOverride?: Partial<NPCAttributes>;
	movementOverride?: Partial<NPCMovementConfig>;
	enemyBehaviourOverride?: Partial<EnemyBehaviour>;
	interactionOverride?: Interaction;
};

export type ResolvedNPC = NPCInstance & {
	definition?: NPCDefinition;
	name: string;
	attributes: NPCAttributes;
	movementMode: NPCMovementMode;
	movementSpeed: number;
	patrolPath?: PatrolPath;
	wanderZone?: WanderZone;
	enemyBehaviour?: EnemyBehaviour;
	interaction?: Interaction;
};

export type MapOverlayFilter =
	| "npc_paths"
	| "enemy_ranges"
	| "event_blocks"
	| "collision"
	| "none";

export type EventBlock = {
	scene?: MapSceneAppearance;
	transform?: MapEntityTransform;
	id: string;
	name: string;
	x: number;
	y: number;
	tag: string;
	kind: "spawn" | "trigger" | "area_link";
	link?: AreaLink;
	interaction?: Interaction;
};

export type AreaLink = {
	targetAreaId: string;
	targetEventBlockId: string;
};

export type TileStyleConfig = {
	[tileId: string]: {
		color: string;
		label?: string;
	};
};

export type PixelAsset = {
	id: string;
	name: string;
	kind: "terrain" | "overlay" | "structure" | "character" | "portrait";
	width: number;
	height: number;
	pixels: string[][];
};

export type CameraConfig = {
	viewportWidthTiles: number;
	viewportHeightTiles: number;
	followPlayer: boolean;
	followSmoothing: number;
	deadzoneWidthTiles?: number;
	deadzoneHeightTiles?: number;
	three: ThreeRuntimeCameraConfig;
};

export type ThreeRuntimeCameraConfig = {
	style: "fixedIsometric" | "thirdPerson";
	distance: number;
	height: number;
	pitchDegrees: number;
	yawOffsetDegrees: number;
	lookAtHeight: number;
	followSmoothing: number;
	lookSmoothing: number;
	allowRuntimeOrbit: boolean;
};

export type PlayerConfig = {
	name: string;
	mapAvatarId: string;
	cutscenePortraitId: string;
	threeVisual?: ThreeVisualConfig;
	speed: number;
	health: number;
	combat?: PlayerCombatStats;
	canWalkOn: string[];
};

export type PlayerCombatStats = {
	maxHealth: number;
	health: number;
	attackDamage: number;
	attackRangeTiles: number;
	attackCooldownMs: number;
};

/** Map grid x/z, with y measured in metres above the scene's zero plane. */
export type CinematicCamera = {
	position: { x: number; y: number; z: number };
	lookAt: { x: number; y: number; z: number };
};

export const CINEMATIC_ACTOR_ANIMATIONS = [
	"idle",
	"walk",
	"run",
	"interact",
	"pickup",
	"attack",
] as const;
export type CinematicActorAnimation =
	(typeof CINEMATIC_ACTOR_ANIMATIONS)[number];

type CinematicCueTime = {
	id?: string;
	/** Storyboard cues follow this shot when its position or duration changes. */
	shotId?: string;
	/** Milliseconds relative to the start of the first shot. */
	startMs: number;
	durationMs: number;
};

export type CinematicSubtitleCue = CinematicCueTime & {
	type: "subtitle";
	speakerId?: string;
	speaker?: string;
	text: string;
};

export type CinematicActorCue = CinematicCueTime & {
	type: "actor";
	/** An NPC placement in this area, or runtime_player. */
	actorId: string;
	animation?: CinematicActorAnimation;
	/** Map grid point to face for this cue. */
	face?: { x: number; z: number };
};

export type CinematicAudioCue = CinematicCueTime & {
	type: "audio";
	url: string;
	sourceName?: string;
	volume?: number;
	offsetMs?: number;
	fadeInMs?: number;
	fadeOutMs?: number;
};

export type CinematicCue =
	| CinematicSubtitleCue
	| CinematicActorCue
	| CinematicAudioCue;

export const CINEMATIC_SHOT_PRESETS = [
	"establishing",
	"close-up",
	"over-shoulder",
	"two-shot",
	"detail",
	"reveal",
	"current-view",
] as const;

export type CinematicShotPreset = (typeof CINEMATIC_SHOT_PRESETS)[number];

export type CinematicShot = {
	id?: string;
	preset?: CinematicShotPreset;
	targetId?: string;
	secondaryTargetId?: string;
	durationMode?: "auto" | "manual";
	durationMs: number;
	from: CinematicCamera;
	to?: CinematicCamera;
	fov?: number;
	ease?: "smooth" | "linear";
	positionOffset?: CinematicCamera["position"];
	lookAtOffset?: CinematicCamera["lookAt"];
	trackingOrigin?: CinematicCamera["lookAt"];
	clearance?: boolean;
};

/** Reserved authored performance data for rigs with a facial profile. */
export type CinematicFaceTrack = {
	actorId: string;
	frames: {
		timeMs: number;
		viseme?: string;
		morphs?: Record<string, number>;
	}[];
};

export type CinematicSequence = {
	areaId: string;
	shots: CinematicShot[];
	cues?: CinematicCue[];
	castIds?: string[];
	/** Visual-only mark for the player during shots. Uses map coordinates. */
	playerMark?: { x: number; y: number };
	faceTracks?: CinematicFaceTrack[];
};

export type Cutscene = {
	id: string;
	name: string;
	backgroundImageId: string;
	portraitImageId?: string;
	speakerName?: string;
	text: string;
	cinematic?: CinematicSequence;
};

export type DialogueDefinition = {
	id: string;
	name: string;
	startNodeId: string;
	nodes: DialogueNode[];
	/** Authoring-only coordinates. Never read by dialogue gameplay. */
	editorLayout?: { nodes: Record<string, { x: number; y: number }> };
};

export type DialogueNode =
	| DialogueTextNode
	| DialogueChoiceNode
	| DialogueEndNode;

export type DialogueTextNode = {
	id: string;
	type: "text";
	speaker?: string;
	portraitId?: string;
	text: string;
	nextNodeId?: string;
	actions?: GameAction[];
};

export type DialogueChoiceNode = {
	id: string;
	type: "choice";
	speaker?: string;
	portraitId?: string;
	text?: string;
	choices: DialogueChoice[];
	actions?: GameAction[];
};

export type DialogueEndNode = {
	id: string;
	type: "end";
	speaker?: string;
	portraitId?: string;
	text?: string;
	actions?: GameAction[];
};

export type DialogueChoice = {
	id: string;
	text: string;
	targetNodeId: string;
	conditions?: DialogueCondition[];
};

export type DialogueCondition =
	| { type: "flag_is"; flag: string; value: boolean }
	| {
			type: "variable_compare";
			variable: string;
			operator: VariableComparisonOperator;
			value: GameStateValue;
	  }
	| { type: "has_item"; itemId: string; quantity?: number }
	| { type: "not_has_item"; itemId: string; quantity?: number }
	| { type: "quest_status"; questId: string; status: QuestStatus };

export type ProgressionStep = {
	id: string;
	label?: string;
	action: ProgressionAction;
};

export type ProgressionAction =
	| { type: "play_cutscene"; cutsceneId: string }
	| { type: "spawn_player"; areaId: string; eventBlockId: string }
	| { type: "wait_for_trigger"; areaId?: string; eventBlockId: string }
	| { type: "teleport_player"; areaId: string; eventBlockId: string }
	| { type: "end_game" };

export type GameStateValue = number | string;

export type GameStateConfig = {
	flags: Record<string, boolean>;
	variables: Record<string, GameStateValue>;
	inventory?: Record<string, number>;
};

export type InventoryState = {
	items: Record<string, number>;
};

export type ItemDefinition = {
	id: string;
	name: string;
	description?: string;
	category: "key" | "currency" | "consumable" | "quest" | "misc" | "weapon";
	/** Optional behaviour reference; ordinary items carry no combat fields. */
	weapon?: "sword" | "bow";
	iconId?: string;
	stackable: boolean;
	maxStack?: number;
};

export type ShopDefinition = {
	id: string;
	name: string;
	currencyItemId: string;
	entries: ShopEntry[];
};

export type ShopEntry = {
	id: string;
	itemId: string;
	buyPrice: number;
	stock?: number;
};

export type QuestStatus = "inactive" | "active" | "completed" | "failed";

export type Quest = {
	id: string;
	name: string;
	description?: string;
	status: QuestStatus;
	// Missing retains legacy independent objectives; new quests use sequence.
	objectiveMode?: "sequence";
	completionMessage?: string;
	objectives: Objective[];
	completionActions?: GameAction[];
	// Legacy compatibility. Imported projects migrate these into completionActions.
	rewards?: QuestReward[];
};

export type Objective = {
	id: string;
	description: string;
	condition: ObjectiveCondition;
};

export type ObjectiveCondition =
	| { type: "interaction_completed"; areaId: string; targetId: string }
	| { type: "container_opened"; areaId: string; targetId: string }
	| { type: "enter_event"; areaId: string; targetId: string }
	| { type: "door_used"; areaId: string; targetId: string }
	| { type: "flag"; flag: string; value: boolean }
	| { type: "has_item"; itemId: string; quantity?: number }
	| {
			type: "variable_compare";
			variable: string;
			operator: VariableComparisonOperator;
			value: GameStateValue;
	  }
	| { type: "enter_area"; areaId: string };

export type QuestReward =
	| { type: "item"; itemId: string; quantity: number }
	| { type: "flag"; flag: string; value: boolean }
	| { type: "variable"; variable: string; amount: number };

export type RuleRunPolicy = "always" | "once";

export type GameRule = {
	id: string;
	name: string;
	enabled: boolean;
	runPolicy?: RuleRunPolicy;
	groupId?: string;
	trigger: RuleTrigger;
	conditionTree?: ConditionExpression;
	actions: GameAction[];
	elseActions?: GameAction[];
};

export type RuleGroup = {
	id: string;
	name: string;
	description?: string;
	collapsed?: boolean;
	parentGroupId?: string;
};

export type RuleTrigger =
	| { type: "on_game_start" }
	| { type: "on_interact"; targetId: string }
	| { type: "on_touch"; targetId: string }
	| { type: "on_area_enter"; areaId: string }
	| { type: "on_cutscene_end"; cutsceneId: string };

// TODO: Add enemy-specific rule triggers such as on_enemy_detect_player and on_enemy_touch_player.

export type VariableComparisonOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

export type ConditionExpression = SingleCondition | ConditionGroup;

export type ConditionGroup = {
	id: string;
	type: "group";
	operator: "AND" | "OR";
	conditions: ConditionExpression[];
};

export type SingleCondition =
	| { id: string; type: "flag_is"; flag: string; value: boolean }
	| {
			id: string;
			type: "variable_compare";
			variable: string;
			operator: VariableComparisonOperator;
			value: GameStateValue;
	  }
	| { id: string; type: "has_item"; itemId: string; quantity?: number }
	| { id: string; type: "not_has_item"; itemId: string; quantity?: number }
	| {
			id: string;
			type: "npc_alignment";
			npcId: string;
			alignment: NPCAlignment;
	  }
	| {
			id: string;
			type: "npc_health_compare";
			npcId: string;
			operator: VariableComparisonOperator;
			value: number;
	  };

export type GameAction =
	| { type: "set_flag"; flag: string; value: boolean }
	| { type: "change_variable"; variable: string; amount: number }
	| { type: "set_variable"; variable: string; value: GameStateValue }
	| { type: "play_cutscene"; cutsceneId: string }
	| { type: "teleport"; areaId: string; eventBlockId: string }
	| { type: "change_movement_mode"; mode: Exclude<MovementMode, "swim"> }
	| { type: "give_item"; itemId: string; quantity: number }
	| { type: "remove_item"; itemId: string; quantity: number }
	| { type: "activate_quest"; questId: string }
	| { type: "complete_quest"; questId: string }
	| { type: "fail_quest"; questId: string }
	| { type: "set_npc_alignment"; npcId: string; alignment: NPCAlignment }
	| { type: "set_npc_health"; npcId: string; value: number }
	| { type: "open_shop"; shopId: string }
	| { type: "end_game" };

// TODO: Future foundations: freeform placement, per-area camera overrides, node graph logic, enemies, sounds, UI editor, asset imports, selling, dynamic pricing, and stock refresh.
