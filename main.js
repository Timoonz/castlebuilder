"use strict";
import { PerspectiveCamera, Scene, WebGLRenderer, BoxGeometry, Mesh, AmbientLight, Clock, Group, MeshStandardMaterial, Fog, Color, PlaneGeometry, Vector3, PointLight } from 'three';
import { Body, Box, Plane, Vec3, World, } from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
var camera, scene, renderer;
// Liste de cubes
var fallingCube;
var stackedCubes = [];
// Le point où nos cubes vons spawner
var spawnPointVec3 = new Vec3(0, 5, 0);
// Le monde physique
var physicsWorld = new World({
    gravity: new Vec3(0, -50, 0),
});
function createFloor() {
    // Three.js (visible) object
    var floor = new Mesh(new PlaneGeometry(1000, 1000), 
    // new ShadowMaterial({
    //     opacity: .1,
    // })
    new MeshStandardMaterial({
        color: 0xF0ccc0,
        roughness: 0.8,
        metalness: 0.2
    }));
    floor.receiveShadow = true;
    floor.position.y = -7;
    floor.quaternion.setFromAxisAngle(new Vector3(-1, 0, 0), Math.PI * .5);
    scene.add(floor);
    // Cannon-es (physical) object
    var floorBody = new Body({
        type: Body.STATIC,
        shape: new Plane(),
    });
    floorBody.position.set(floor.position.x, floor.position.y, floor.position.z);
    floorBody.quaternion.set(floor.quaternion.x, floor.quaternion.y, floor.quaternion.z, floor.quaternion.w);
    physicsWorld.addBody(floorBody);
}
function createCube() {
    var cubeGroup = new Group();
    var cubeGeometry = new BoxGeometry(2.0, 2.0, 2.0);
    var cubeMaterial = new MeshStandardMaterial({ color: 0x0095dd });
    var cube = new Mesh(cubeGeometry, cubeMaterial);
    cube.castShadow = true;
    var cubeBody = new Body({
        mass: 1,
        shape: new Box(new Vec3(1.0, 1.0, 1.0)),
        sleepTimeLimit: .1
    });
    cubeBody.position.copy(spawnPointVec3);
    cubeGroup.position.copy(cubeBody.position);
    physicsWorld.addBody(cubeBody);
    cubeGroup.add(cube);
    scene.add(cubeGroup);
    return { cubeGroup: cubeGroup, cubeBody: cubeBody };
}
function init() {
    var container = document.getElementById('container');
    camera = new PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(10, 30, 50);
    scene = new Scene();
    scene.background = new Color().setHSL(0.6, 0, 1);
    scene.fog = new Fog(scene.background, 1, 5000);
    var ambientLight = new AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    var topLight = new PointLight(0xffffff, 500);
    topLight.position.set(10, 15, 0);
    topLight.castShadow = true;
    topLight.shadow.mapSize.width = 2048;
    topLight.shadow.mapSize.height = 2048;
    topLight.shadow.camera.near = 0.5;
    topLight.shadow.camera.far = 50;
    scene.add(topLight);
    // RENDERER
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    // CONTROLS
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.listenToKeyEvents(window); // optional
    createFloor();
}
function loadData() {
    new GLTFLoader()
        .setPath('assets/models/')
        .load('test.glb', gltfReader);
}
function gltfReader(gltf) {
    var testModel = null;
    testModel = gltf.scene;
    if (testModel != null) {
        console.log("Model loaded:  " + testModel);
        scene.add(gltf.scene);
    }
    else {
        console.log("Load FAILED.  ");
    }
}
// loadData();
var clock = new Clock();
var lastSpawnTime = 0;
var spawnInterval = 5;
function render() {
    physicsWorld.fixedStep();
    var currentTime = clock.getElapsedTime();
    if (currentTime - lastSpawnTime >= spawnInterval) {
        if (fallingCube) {
            stackedCubes.push(fallingCube);
        }
        fallingCube = createCube();
        lastSpawnTime = currentTime;
    }
    if (fallingCube) {
        fallingCube.cubeGroup.position.copy(fallingCube.cubeBody.position);
        fallingCube.cubeGroup.quaternion.copy(fallingCube.cubeBody.quaternion);
    }
    // Update all cubes to match their physics bodies
    stackedCubes.forEach(function (_a) {
        var cubeGroup = _a.cubeGroup, cubeBody = _a.cubeBody;
        cubeGroup.position.copy(cubeBody.position);
        cubeGroup.quaternion.copy(cubeBody.quaternion);
    });
    requestAnimationFrame(render);
    renderer.render(scene, camera);
}
init();
render();
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
//# sourceMappingURL=main.js.map