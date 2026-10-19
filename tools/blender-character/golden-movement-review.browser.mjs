import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
const p = new URLSearchParams(location.search);
const asset =
	p.get("asset") || "/assets/derived/authored-humans/everyday-v1/mannequin.glb";
const url =
	p.get("library") ||
	"/assets/derived/humanoid-animations/golden-movement-v1/actions.glb";
const name = p.get("action") || "Run";
const loader = new GLTFLoader();
const [model, library] = await Promise.all([
	loader.loadAsync(asset),
	loader.loadAsync(url),
]);
const clip = library.animations.find((c) => c.name.includes("_" + name + "_"));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#cbd3d9");
scene.add(new THREE.HemisphereLight(0xffffff, 0x536175, 2.2));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(3, 5, 4);
scene.add(light);
const actor = clone(model.scene);
scene.add(actor);
const mixer = new THREE.AnimationMixer(actor);
const action = mixer.clipAction(clip);
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
const floor = new THREE.Mesh(
	new THREE.PlaneGeometry(50, 50),
	new THREE.MeshStandardMaterial({ color: 0x849493 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(50, 100, 0x667673, 0x91a19c));
const cameras = [
	[5, 6.5, 7],
	[3.6, 1.65, 0],
	[2.8, 1.9, 3.6],
	[-2.8, 1.9, -3.6],
].map((v, i) => {
	const c = new THREE.PerspectiveCamera(
		i === 0 ? 55 : 38,
		640 / 380,
		0.01,
		100,
	);
	c.position.set(...v);
	c.lookAt(0, i === 0 ? 0.05 : 0.8, 0);
	return c;
});
const renderer = new THREE.WebGLRenderer({
	antialias: true,
	preserveDrawingBuffer: true,
});
renderer.setSize(1280, 760);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const labels = p.get("close")
	? ["Fist: front quarter", "Fist: side", "Fist: front", "Fist: rear quarter"]
	: [
			"Gameplay scale (fixed isometric)",
			"Side",
			"Front quarter",
			"Rear quarter",
		];
for (let i = 0; i < 4; i++) {
	const d = document.createElement("div");
	d.textContent = labels[i];
	Object.assign(d.style, {
		position: "absolute",
		left: (i % 2) * 640 + 16 + "px",
		top: 40 + Math.floor(i / 2) * 380 + 10 + "px",
		color: "#17202a",
		fontWeight: "bold",
	});
	document.body.append(d);
}
window.sample = (t) => {
	action.reset().play();
	mixer.setTime(Math.min(t, clip.duration));
	actor.updateMatrixWorld(true);
	actor.traverse((o) => {
		if (o.isSkinnedMesh) o.skeleton.update();
	});
	if (p.get("close")) {
		const hand = actor
			.getObjectByName("hand_r")
			.getWorldPosition(new THREE.Vector3());
		for (let i = 0; i < cameras.length; i++) {
			cameras[i].position.copy(hand).add(
				new THREE.Vector3(
					...[
						[0.65, 0.3, 0.45],
						[0.7, 0.1, 0],
						[0, 0.1, 0.7],
						[-0.7, 0.1, 0.2],
					][i],
				),
			);
			cameras[i].lookAt(hand);
		}
	}
	renderer.setScissorTest(true);
	for (let i = 0; i < 4; i++) {
		const x = (i % 2) * 640,
			y = (1 - Math.floor(i / 2)) * 380;
		renderer.setViewport(x, y, 640, 380);
		renderer.setScissor(x, y, 640, 380);
		renderer.render(scene, cameras[i]);
	}
	document.querySelector("#clock").textContent =
		t.toFixed(3) + " / " + clip.duration.toFixed(3) + " s";
};
let playing = false,
	start = 0;
function raf(now) {
	if (playing) {
		window.sample(
			((now - start) / 1000) %
				(clip.duration + (["Run", "Fall"].includes(name) ? 0 : 0.6)),
		);
		requestAnimationFrame(raf);
	}
}
window.play = () => {
	playing = true;
	start = performance.now();
	requestAnimationFrame(raf);
};
window.pause = () => {
	playing = false;
};
document.onkeydown = (e) => {
	if (e.code === "Space") {
		playing ? window.pause() : window.play();
	}
};
window.review = { duration: clip.duration, clip: clip.name, asset, url };
window.sample(0);
window.reviewReady = true;
document.querySelector("#title").textContent =
	name + " / " + (p.get("label") || "V1");
window.play();
