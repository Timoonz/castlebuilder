"use strict";

import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  BoxGeometry,
  Mesh,
  AmbientLight,
  Clock,
  Group,
  MeshStandardMaterial,
  Object3DEventMap,
  Fog,
  Color,
  PlaneGeometry,
  Vector3,
  PointLight,
  CylinderGeometry,
  BufferGeometry
} from 'three';

import {
  Body,
  Box,
  Plane,
  Vec3,
  World,
  Material,
  ContactMaterial,
  Cylinder,
} from 'cannon-es'

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import {
  GLTF,
  GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';

// ─── Caméra / scène / renderer ───────────────────────────────────────────────
let camera: PerspectiveCamera, scene: Scene<Object3DEventMap>, renderer: WebGLRenderer;

//─── Temps ─────────────────────────────────────────────────────────────────────
const clock = new Clock();
let lastSpawnTime = 0;
const spawnInterval = 5;

//─── Pièces ─────────────────────────────────────────────────────────────────────

type PieceShape = "cube" | "cylinder"

interface PieceConfig {
  shape: PieceShape;
  size: number;
  mass: number;
  color: number;
}

const PIECES: Record<string, PieceConfig> = {
  cube: {
    shape: 'cube',
    size: 1.0,      // half-extent → 2×2×2 visual box
    mass: 1.0,
    color: 0x0095dd,
  },
  cylinder: {
    shape: 'cylinder',
    size: 1.0,
    mass: 1.0,
    color: 0x8e44ad,
  },
}

let currentPiece: keyof typeof PIECES = 'cylinder';

// Le cube qui tombe
let fallingPiece: { group: Group, body: Body, physMat: Material };

// Liste des cubes stackés
let stackedPieces: Array<{ group: Group, body: Body, physMat: Material }> = [];

// Les pièces qui sont tombées sur le sol et qui sont à casser
let piecesToBreak: Array<{ group: Group, body: Body, physMat: Material }> = [];

// Les débris des pièces cassées
let debris: Array<{ group: Group, body: Body }> = [];

//─── Point de spawn ─────────────────────────────────────────────────────────────────────
let spawnPointPosition = new Vec3(0, 10, 0);

//─── Monde physique ─────────────────────────────────────────────────────────────────────
let physicsWorld = new World({
  gravity: new Vec3(0, -5, 0),
});

// ─── Matériaux physiques ───────────────────────────────────────────────────────
const floorPhysMaterial = new Material();

// Piece ↔ floor
const PieceToFloorBounciness = 0.0;
const PieceToFloorFriction = 0.5;

// Piece ↔ piece
const PieceToPieceBounciness = 0.7;
const PieceToPieceFriction = 1.0;

// ─── Helper: build Three.js geometry from config ──────────────────────────────
function buildGeometry(config: PieceConfig): BufferGeometry {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new BoxGeometry(s * 2, s * 2, s * 2);
    case 'cylinder': return new CylinderGeometry(s, s, s * 2, 16);
  }
}

// ─── Helper: build Cannon-ES shape from config ────────────────────────────────
function buildPhysicsShape(config: PieceConfig) {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new Box(new Vec3(s, s, s));
    case 'cylinder': return new Cylinder(s, s, s * 2, 16);
  }
}

//  ─── Les débris ────────────────────────────────
const DEBRIS_COUNT = 6; // En combien de débris on veut que les pièces se cassent

function breakPiece(piece: { group: Group, body: Body, physMat: Material }) {
  const pos = piece.body.position;
  const vel = piece.body.velocity;
  const color = ((piece.group.children[0] as Mesh).material as MeshStandardMaterial).color.getHex();

  // Supprimer la pièce originale
  scene.remove(piece.group);
  physicsWorld.removeBody(piece.body);

  // Générer les débris
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const fragSize = 0.2 + Math.random() * 0.25;

    const fragGroup = new Group();
    const fragMesh = new Mesh(
      new BoxGeometry(fragSize * 2, fragSize * 2, fragSize * 2),
      new MeshStandardMaterial({ color, roughness: 1.0 })
    );
    fragMesh.castShadow = true;
    fragGroup.add(fragMesh);
    scene.add(fragGroup);

    const fragBody = new Body({
      mass: 0.1,
      shape: new Box(new Vec3(fragSize, fragSize, fragSize)),
      linearDamping: 0.4,
      angularDamping: 0.4,
    });

    // Position dispersée autour du centre de la pièce
    fragBody.position.set(
      pos.x + (Math.random() - 0.5) * 1.2,
      pos.y + (Math.random() - 0.5) * 0.5,
      pos.z + (Math.random() - 0.5) * 1.2,
    );

    // Vélocité : hérite de l'impact + dispersion latérale
    const spread = 3;
    fragBody.velocity.set(
      vel.x * 0.3 + (Math.random() - 0.5) * spread,
      Math.random() * 2,
      vel.z * 0.3 + (Math.random() - 0.5) * spread,
    );

    fragBody.angularVelocity.set(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
    );

    physicsWorld.addBody(fragBody);
    debris.push({ group: fragGroup, body: fragBody });
  }
}

function createPiece(config: PieceConfig) {
  // côté Three.js 
  const group = new Group();
  const mesh = new Mesh(buildGeometry(config), new MeshStandardMaterial({ color: config.color }));
  mesh.castShadow = true;
  group.add(mesh);
  scene.add(group);

  // côté Cannon-ES 
  const physMat = new Material();
  const body = new Body({
    mass: config.mass,
    material: physMat,
    shape: buildPhysicsShape(config),
    sleepTimeLimit: 0.1,
  });

  body.position.copy(spawnPointPosition);
  group.position.copy(body.position as any);
  physicsWorld.addBody(body);

  // Contact: pièce ↔ sol
  physicsWorld.addContactMaterial(
    new ContactMaterial(floorPhysMaterial, physMat, {
      friction: PieceToFloorFriction,
      restitution: PieceToFloorBounciness,
    })
  );

  // Contact: pièce ↔ pièces
  stackedPieces.forEach(({ physMat: existingMat }) => {
    physicsWorld.addContactMaterial(
      new ContactMaterial(existingMat, physMat, {
        friction: PieceToPieceFriction,
        restitution: PieceToPieceBounciness,
      })
    );
  });

  const piece = { group, body, physMat };
  body.addEventListener('collide', (event: any) => {
    const otherBody: Body = event.body;
    if (otherBody === floorBody) {
      if (!piecesToBreak.includes(piece)) {
        piecesToBreak.push(piece);
      }
    }
  });


  return { group, body, physMat };
}

//  ─── Listener:  ─────────────────────────────────────────────────────────────────


//  ─── SpawnPoint ─────────────────────────────────────────────────────────────────
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

function updateSpawnPoint(spawnPoint: any) {
  spawnPoint.position.set(spawnPointPosition.x, spawnPointPosition.y, spawnPointPosition.z);
}

// ─── Plateforme ─────────────────────────────────────────────────────────────────
function createPlatform(x: number, y: number, z: number, width: number, height: number, depth: number) {
  const platformMesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial({ color: 0x7ec850, roughness: 0.9, metalness: 0.0 })
  );
  platformMesh.position.set(x, y, z);
  platformMesh.receiveShadow = true;
  platformMesh.castShadow = true;
  scene.add(platformMesh);

  const platformBody = new Body({
    type: Body.STATIC,
    material: floorPhysMaterial,
    shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
  });
  platformBody.position.set(x, y, z);
  physicsWorld.addBody(platformBody);


}

//  ─── Sol ─────────────────────────────────────────────────────────────────
let floorBody: Body; // le coprs physique du sol, pour qu'il soit accessible partout

function createFloor(y: number) {

  const floor = new Mesh(
    new PlaneGeometry(1000, 1000),
    new MeshStandardMaterial({
      color: 0xF0ccc0,
      roughness: 0.8,
      metalness: 0.2
    })
  );

  floor.position.y = y;
  floor.quaternion.setFromAxisAngle(new Vector3(-1, 0, 0), Math.PI * .5);

  floor.receiveShadow = true;

  scene.add(floor);

  floorBody = new Body({
    type: Body.STATIC,
    // material: floorPhysMaterial,
    shape: new Plane(),
  });
  floorBody.position.set(floor.position.x, floor.position.y, floor.position.z);
  floorBody.quaternion.set(floor.quaternion.x, floor.quaternion.y, floor.quaternion.z, floor.quaternion.w);
  physicsWorld.addBody(floorBody);
}


function init() {

  const container = document.getElementById('container');

  camera = new PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 5000);
  camera.position.set(10, 30, 50);

  scene = new Scene();
  scene.background = new Color().setHSL(0.6, 0, 1);
  scene.fog = new Fog(scene.background, 1, 5000);

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


  // Le renderer
  renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container!.appendChild(renderer.domElement);


  // Contrôles de la caméra
  const controls = new OrbitControls(camera, renderer.domElement);

  // Contrôles du spawn point
  window.addEventListener('keydown', (event) => {

    if (event.key === 'ArrowUp') spawnPointPosition.z += - 1;
    if (event.key === 'ArrowDown') spawnPointPosition.z += 1;
    if (event.key === 'ArrowLeft') spawnPointPosition.x += - 1;
    if (event.key === 'ArrowRight') spawnPointPosition.x += 1;

    updateSpawnPoint(scene.getObjectByName("spawnPoint"));

  });

  // On crée nos objets
  createFloor(-5); // Le sol
  createSpawnPoint(); // Le point de spawn
  createPlatform(0, -2, 0, 24, 1, 24); // La petite plateforme

}

function loadData() {
  new GLTFLoader()
    .setPath('assets/models/')
    .load('test.glb', gltfReader);
}

function gltfReader(gltf: GLTF) {
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



function render() {
  physicsWorld.fixedStep();


  if (piecesToBreak.length > 0) {
    piecesToBreak.forEach(piece => {
      stackedPieces = stackedPieces.filter(p => p.body !== piece.body);
      if (fallingPiece && fallingPiece.body === piece.body) {
        (fallingPiece as any) = null;
      }
      breakPiece(piece);
    });
    piecesToBreak = [];
  }

  const currentTime = clock.getElapsedTime();

  if (currentTime - lastSpawnTime >= spawnInterval) {
    if (fallingPiece) {
      stackedPieces.push(fallingPiece);
    }
    fallingPiece = createPiece(PIECES[currentPiece]);;
    lastSpawnTime = currentTime;
  }

  if (fallingPiece) {
    fallingPiece.group.position.copy(fallingPiece.body.position as any);
    fallingPiece.group.quaternion.copy(fallingPiece.body.quaternion as any);
  }


  // Update all cubes to match their physics bodies
  stackedPieces.forEach(({ group, body }) => {
    group.position.copy(body.position as any);
    group.quaternion.copy(body.quaternion as any);
  });

  debris.forEach(({ group, body }) => {
    group.position.copy(body.position as any);
    group.quaternion.copy(body.quaternion as any);
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
