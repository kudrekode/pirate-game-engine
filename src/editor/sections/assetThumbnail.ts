import * as THREE from "three";

/** Same neutral, three-quarter framing for cached live previews and shipped cards. */
export function renderAssetThumbnail(
	renderer: THREE.WebGLRenderer,
	model: THREE.Object3D,
	width = 256,
	height = 192,
): string {
	renderer.setSize(width, height);
	renderer.setClearColor(0xd2d8dc, 1);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	const scene = new THREE.Scene();
	scene.add(new THREE.HemisphereLight(0xffffff, 0x687585, 2));
	const light = new THREE.DirectionalLight(0xfff3df, 3);
	light.position.set(3, 5, 4);
	scene.add(light);
	const box = new THREE.Box3().setFromObject(model);
	const size = box.getSize(new THREE.Vector3());
	model.position.sub(box.getCenter(new THREE.Vector3()));
	scene.add(model);
	const camera = new THREE.PerspectiveCamera(35, width / height, 0.001, 10000);
	const distance = Math.max(size.x, size.y, size.z, 0.01) * 2.1;
	camera.position.set(distance * 0.65, distance * 0.4, distance);
	camera.lookAt(0, 0, 0);
	renderer.render(scene, camera);
	return renderer.domElement.toDataURL("image/png");
}
