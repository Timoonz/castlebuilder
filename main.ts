"use strict";

import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  BoxGeometry,
  Mesh,
  MeshNormalMaterial,
  AmbientLight,
  Clock,
  Group,
  SphereGeometry,
  MeshStandardMaterial,
  MeshPhongMaterial,
  Object3DEventMap,
  Object3D,
  Camera,
  HemisphereLight,
  Fog,
  Color,
  DirectionalLight,
  PlaneGeometry,
  ShadowMaterial,
  Vector3,
  MeshBasicMaterial,
  PointLight
} from 'three';

import {
  Body,
  Box,
  Plane,
  Vec3,
  World,

} from 'cannon-es'

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import {
  GLTF,
  GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';

let camera: PerspectiveCamera, scene: Scene<Object3DEventMap>, renderer: WebGLRenderer;

// Le cube qui tombe
let fallingCube: {cubeGroup: Group, cubeBody: Body};
let fallingCubeMovement: { forward: any; right: any; };
// Liste des cubes stackés
let stackedCubes: Array<{cubeGroup: Group, cubeBody: Body}> = [];

// Le point où nos cubes vons spawner
let spawnPointPosition = new Vec3(0, 10, 0);

// Le monde physique
let physicsWorld = new World({
  gravity: new Vec3(0, -5, 0),
})

function createSpawnPoint() {
  const spawnPointGeom = new BoxGeometry(1.0, 1.0, 1.0);
  const spawnPointMaterial = new MeshStandardMaterial({ color: 0xb20000 });
  const spawnPoint = new Mesh(spawnPointGeom, spawnPointMaterial);
  
  spawnPoint.name = "spawnPoint";
  spawnPoint.position.set(spawnPointPosition.x, spawnPointPosition.y, spawnPointPosition.z);
  
  const spawnPointGroup = new Group();
  spawnPointGroup.add(spawnPoint);
  scene.add(spawnPointGroup);
}

function updateSpawnPoint(spawnPoint: any){
  spawnPoint.position.set(spawnPointPosition.x, spawnPointPosition.y, spawnPointPosition.z);
}

function createFloor() {
    
    // Three.js (visible) object
    const floor = new Mesh(
        new PlaneGeometry(1000, 1000),
        // new ShadowMaterial({
        //     opacity: .1,
        // })
        new MeshStandardMaterial({ 
          color: 0xF0ccc0,
          roughness: 0.8,
          metalness: 0.2 
        })
    )
    floor.receiveShadow = true;
    floor.position.y = -5;
    floor.quaternion.setFromAxisAngle(new Vector3(-1, 0, 0), Math.PI * .5);
    scene.add(floor);

    // Cannon-es (physical) object
    const floorBody = new Body({
        type: Body.STATIC,
        shape: new Plane(),
    });
    floorBody.position.set(floor.position.x, floor.position.y, floor.position.z);
    floorBody.quaternion.set(floor.quaternion.x, floor.quaternion.y, floor.quaternion.z, floor.quaternion.w);
    physicsWorld.addBody(floorBody);
}

function createCube () {
  const cubeGroup = new Group();
  const cubeGeometry = new BoxGeometry(2.0, 2.0, 2.0);
  const cubeMaterial = new MeshStandardMaterial({ color: 0x0095dd });
  const cube = new Mesh(cubeGeometry, cubeMaterial);

  cube.castShadow = true;

  const cubeBody = new Body({
      mass: 1,
      shape: new Box(new Vec3(1.0, 1.0, 1.0)),
      sleepTimeLimit: .1
  });
  

  cubeBody.position.copy(spawnPointPosition);
  cubeGroup.position.copy(cubeBody.position as any);
  
  physicsWorld.addBody(cubeBody);
  
  cubeGroup.add(cube);
  scene.add(cubeGroup);

  return {cubeGroup, cubeBody}
}

function init () {

  const container = document.getElementById( 'container' );

	camera = new PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 1, 5000 );
	camera.position.set( 10, 30, 50 );

	scene = new Scene();
	scene.background = new Color().setHSL( 0.6, 0, 1 );
	scene.fog = new Fog( scene.background, 1, 5000 );

  const ambientLight = new AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const topLight = new PointLight(0xffffff, 500);
  topLight.position.set(10, 15, 0);
  topLight.castShadow = true;
  topLight.shadow.mapSize.width = 2048;
  topLight.shadow.mapSize.height = 2048;
  topLight.shadow.camera.near = 0.5;
  topLight.shadow.camera.far = 50;
  scene.add(topLight);


  // RENDERER
  renderer = new WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  container!.appendChild( renderer.domElement );


  // CONTROLS

  const controls = new OrbitControls(camera, renderer.domElement);
  // controls.listenToKeyEvents(window); // optional


  // FALLING BLOCK CONTROLS

  fallingCubeMovement = { forward: 0, right: 0 };

	window.addEventListener( 'keydown', ( event ) => {

		if (event.key === 'ArrowUp' ) spawnPointPosition.z += - 1;
		if (event.key === 'ArrowDown' ) spawnPointPosition.z += 1;
		if (event.key === 'ArrowLeft' ) spawnPointPosition.x +=  - 1;
		if (event.key === 'ArrowRight' ) spawnPointPosition.x += 1;

    updateSpawnPoint(scene.getObjectByName("spawnPoint"));
			
	} );

  createFloor();
  createSpawnPoint();
}

function loadData() {
  new GLTFLoader()
    .setPath('assets/models/')
    .load('test.glb', gltfReader);
}

function gltfReader(gltf : GLTF) {
  let testModel = null;

  testModel = gltf.scene;

  if (testModel != null) {
    console.log("Model loaded:  " + testModel);
    scene.add(gltf.scene);
  } else {
    console.log("Load FAILED.  ");
  }
}

// loadData();

const clock = new Clock();
let lastSpawnTime = 0; 
const spawnInterval = 5;

function render () {
  physicsWorld.fixedStep();

  const currentTime = clock.getElapsedTime();

  if (currentTime - lastSpawnTime >= spawnInterval) {
    if (fallingCube) {
      stackedCubes.push(fallingCube);
    }
    fallingCube = createCube();
    lastSpawnTime = currentTime;
  }

  if (fallingCube) {
    fallingCube.cubeGroup.position.copy(fallingCube.cubeBody.position as any);
    fallingCube.cubeGroup.quaternion.copy(fallingCube.cubeBody.quaternion as any);
  }


  // Update all cubes to match their physics bodies
  stackedCubes.forEach(({cubeGroup, cubeBody}) => {
    cubeGroup.position.copy(cubeBody.position as any);
    cubeGroup.quaternion.copy(cubeBody.quaternion as any);
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
