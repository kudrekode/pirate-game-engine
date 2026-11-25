import {
	AmbientLight,
	AnimationMixer,
	Box3,
	Color,
	DirectionalLight,
	Group,
	OrthographicCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { prepareThreeCharacterAnimationClip } from "../src/runtime/three/threeCharacterAnimation";
import { createVehicleSeat } from "../src/runtime/three/vehiclePresentation";

// Opt-in browser module. Each original/prepared pair shares clock, camera,
// geometry, textures and illumination. No state is read from the game session.
export async function renderStationaryGaits() {
	const loader = new GLTFLoader();
	const [wayfarer, humanWalk, horse, ride] = await Promise.all([
		loader.loadAsync("/assets/hollow-kingdom/wayfarer.glb"),
		loader.loadAsync(
			"/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.clip.glb",
		),
		loader.loadAsync("/assets/hollow-kingdom/horse.glb"),
		loader.loadAsync("/assets/hollow-kingdom/rider.glb"),
	]);
	const renderer = new WebGLRenderer({
		antialias: true,
		preserveDrawingBuffer: true,
	});
	renderer.setSize(960, 600, false);
	const canvas = renderer.domElement;
	canvas.style.cssText =
		"position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647";
	document.body.append(canvas);
	const scene = new Scene();
	scene.background = new Color(0x394151);
	const key = new DirectionalLight(0xfff4da, 2.2);
	key.position.set(-3, 5, 4);
	scene.add(new AmbientLight(0xe6eaff, 1.6), key);
	const camera = new OrthographicCamera(-2.3, 2.3, 1.45, -1.45, 0.01, 30);
	const entries = [];
	for (const mounted of [false, true])
		for (const prepared of [false, true]) {
			const source = mounted ? horse : wayfarer;
			const root = clone(source.scene);
			const sourceClip = mounted
				? horse.animations.find((c) => c.name === "HorseWalk")
				: humanWalk.animations[0];
			const result = prepareThreeCharacterAnimationClip(
				mounted ? "mere-horse" : "golden-reference-quaternius-walk-baked-v1",
				sourceClip,
				root,
			);
			if (result.status !== "prepared") throw Error(result.reason);
			const mixer = new AnimationMixer(root);
			mixer.clipAction(prepared ? result.clip : sourceClip).play();
			const group = new Group();
			group.add(root);
			let seat;
			let riderMixer;
			if (mounted) {
				const rider = clone(wayfarer.scene);
				const pelvis = rider.getObjectByName("pelvis");
				riderMixer = new AnimationMixer(rider);
				riderMixer.clipAction(ride.animations[0]).play();
				group.add(rider);
				const attach = createVehicleSeat(root, {
					height: 1.52,
					node: "Saddle",
				});
				seat = () => attach(rider, pelvis);
			}
			mixer.update(0);
			riderMixer?.update(0);
			seat?.();
			const bounds = new Box3().setFromObject(group);
			const center = bounds.getCenter(new Vector3());
			scene.add(group);
			entries.push({
				group,
				mixer,
				riderMixer,
				seat,
				center,
				period: sourceClip.duration,
				name: `${mounted ? "Bracken + rider" : "Wayfarer"} / ${prepared ? "prepared" : "source"}`,
			});
		}
	const frame = (entry, time) => {
		for (const item of entries) item.group.visible = item === entry;
		entry.mixer.setTime(time);
		entry.riderMixer?.setTime(time);
		entry.seat?.();
		camera.position.copy(entry.center).add(new Vector3(3.5, 0.55, 1.5));
		camera.lookAt(entry.center);
		camera.updateProjectionMatrix();
	};
	try {
		// Adjacent viewports use the same animation timestamp on every RAF.
		const started = performance.now();
		let drawnFrames = 0;
		await new Promise((resolve) => {
			function draw(t) {
				renderer.setScissorTest(true);
				entries.forEach((entry, i) => {
					const x = (i % 2) * 480,
						y = i < 2 ? 300 : 0;
					renderer.setViewport(x, y, 480, 300);
					renderer.setScissor(x, y, 480, 300);
					frame(entry, (t - started) / 1000);
					renderer.render(scene, camera);
				});
				drawnFrames++;
				if (t - started < 20000) requestAnimationFrame(draw);
				else resolve();
			}
			requestAnimationFrame(draw);
		});
		renderer.setScissorTest(false);
		renderer.setSize(240, 180, false);
		renderer.setViewport(0, 0, 240, 180);
		camera.left = -1.85;
		camera.right = 1.85;
		camera.top = 1.39;
		camera.bottom = -1.39;
		const sheet = document.createElement("canvas");
		const columns = [-2, -1, 0, 1, 2];
		sheet.width = columns.length * 240;
		sheet.height = 4 * 206 + 24;
		const ctx = sheet.getContext("2d");
		ctx.fillStyle = "#1c2230";
		ctx.fillRect(0, 0, sheet.width, sheet.height);
		ctx.fillStyle = "white";
		ctx.font = "15px sans-serif";
		columns.forEach((offset, i) => {
			ctx.fillText(
				`${((1000 * offset) / 60).toFixed(1)} ms from wrap`,
				i * 240 + 8,
				18,
			);
		});
		entries.forEach((entry, row) => {
			const y = 24 + row * 206;
			ctx.fillText(entry.name, 8, y + 16);
			columns.forEach((offset, i) => {
				frame(entry, entry.period + offset / 60);
				renderer.render(scene, camera);
				ctx.drawImage(canvas, i * 240, y + 23);
			});
		});
		return {
			durationSeconds: (performance.now() - started) / 1000,
			drawnFrames,
			image: sheet.toDataURL("image/png").split(",")[1],
		};
	} finally {
		for (const entry of entries) {
			entry.mixer.stopAllAction();
			entry.riderMixer?.stopAllAction();
		}
		renderer.dispose();
		renderer.forceContextLoss();
		canvas.remove();
	}
}
