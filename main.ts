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

import { EffectComposer } from 'three/examples/jsm/Addons.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SynthManager } from "./src/SynthManager";

//─── Temps ─────────────────────────────────────────────────────────────────────
const clock = new Clock();
let lastSpawnTime = 0;
let spawnInterval: number;

// ─── Caméra / scène / renderer ───────────────────────────────────────────────
let scene: Scene<Object3DEventMap>;
let composer: EffectComposer;
let camera = new PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 5000);
let renderer = new WebGLRenderer({ antialias: true });

// ─── Gestion du ceiling ───────────────────────────────────────────────
let CEIL = 10;
const CEIL_INCREMENT = 10;
const piecesAboveCeil = new Set<Body>();

// ─── Gestion des niveaux ───────────────────────────────────────────────
let pieceColor = 0x8e44ad;

// ─── Contrôles de la caméra ───────────────────────────────────────────────
const ORBIT_RADIUS = Math.sqrt(2800);
let cameraAngle = Math.atan2(10, 50);
const CAMERA_SPEED = 0.03;

let cameraAbove = false;

// Pour éviter d'avoir à recréer un "eventListener" à chaque tour de boucle
// Puisque l'on veut que la caméra s'update à chaque frame
const keysDown: Record<string, boolean> = {};

window.addEventListener('keydown', e => {
  keysDown[e.key] = true;
  if (e.key === 'z') cameraAbove = !cameraAbove; // Si on appuie sur z, alors on passe en mode "vue de dessus"
});
window.addEventListener('keyup', e => { keysDown[e.key] = false; });

// Piur remettre la caméra à son état "normal"
function resetCamera() {
  camera.position.set(
    Math.sin(cameraAngle) * ORBIT_RADIUS,
    CEIL + 25, // On met la caméra au-dessus du plafond
    Math.cos(cameraAngle) * ORBIT_RADIUS
  );
}

// Pour mettre la caméra en vue de dessus
function setCameraAbove() {
  camera.position.set(
    0,
    CEIL + 30,
    0
  );
}

function updateCameraOrbit() {
  if (cameraAbove) { // Si la caméra doit être mise en vue de dessus, alors on la met
    setCameraAbove()
  }
  else {
    // Sin on appuie sur 'q' ou 'd', ou bouge à gauche/droite sur le cercle
    if (keysDown['q']) cameraAngle -= CAMERA_SPEED;
    if (keysDown['d']) cameraAngle += CAMERA_SPEED;
    resetCamera();
  }
  camera.lookAt(0, CEIL - 10, 0);
}

// ─── Audio ───────────────────────────────────────────────
const synthManager = new SynthManager();

// Une histoire de contexte audio à remplacer pour zzfx
const unlockAudio = () => {
  const ctx = new AudioContext();
  ctx.resume().then(() => ctx.close());
  window.removeEventListener('click', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);



//─── Pièces ─────────────────────────────────────────────────────────────────────

type PieceShape = "cube" | "cylinder" | "cone" | "bigRect" | "thinRect"

interface PieceConfig {
  shape: PieceShape;
  size: number;
  mass: number;
}

const PIECES: Record<string, PieceConfig> = {
  cube: {
    shape: 'cube',
    size: 1.5,
    mass: 1.0,
  },
  cylinder: {
    shape: 'cylinder',
    size: 1.5,
    mass: 1.0,
  },
  cone: {
    shape: 'cone',
    size: 1.5,
    mass: 1.0,
  },
  bigRect: {
    shape: 'bigRect',
    size: 1.5,
    mass: 2.0,
  },
  thinRect: {
    shape: 'thinRect',
    size: 1.5,
    mass: 0.8,
  },
}


// Le cube qui tombe
let fallingPiece: { group: Group, body: Body, physMat: Material };

// Liste des cubes stackés
let stackedPieces: Array<{ group: Group, body: Body, physMat: Material }> = [];

// Les pièces qui sont tombées sur le sol et qui sont à casser
let piecesToBreak: Array<{ group: Group, body: Body, physMat: Material }> = [];


const DEBRIS_COUNT = 6; // En combien de débris on veut que les pièces se cassent
const DEBRIS_LIFETIME = 4;  // Le temps à partir duquel les débris disparaîssent cimplètement
const FADE_START = DEBRIS_LIFETIME * 0.5; // Le temps à partir duquel les débris commencent à fader

// Les débris des pièces cassées
let debris: Array<{ group: Group, body: Body, spawnTime: number }> = [];

// ─── État de la pièce en attente ─────────────────────────────────────────────
let waitingPiece: { group: Group, body: Body, physMat: Material } | null = null;
let waitingPieceSpawnTime = 0;

// Génération randopme de la nouvelel pièce
let currentPiece: keyof typeof PIECES = 'cylinder';
function createWaitingPiece() {
  const keys = Object.keys(PIECES);
  currentPiece = keys[Math.floor(Math.random() * keys.length)];
  waitingPiece = createPiece(PIECES[currentPiece]);
  waitingPieceSpawnTime = clock.getElapsedTime();
};

function releasePiece() {
  if (!waitingPiece) return;

  // On active la physique
  waitingPiece.body.type = Body.DYNAMIC;
  waitingPiece.body.wakeUp();

  fallingPiece = waitingPiece;
  waitingPiece = null;
}

//─── Point de spawn ─────────────────────────────────────────────────────────────────────
let spawnPointPosition = new Vec3(0, CEIL + 5, 0);

//─── Monde physique ─────────────────────────────────────────────────────────────────────
let physicsWorld = new World({
  gravity: new Vec3(0, -5, 0),
});

// ─── Matériaux physiques ───────────────────────────────────────────────────────
const floorPhysMaterial = new Material();

// Piece ↔ platform
let PieceToFloorBounciness: number;
let PieceToFloorFriction: number;

// Piece ↔ piece
let PieceToPieceBounciness: number;
let PieceToPieceFriction: number;


// ─── Gestion du nombre de vies ─────────────────────────────────────────────────────────────────────
let livesCount: number;
let isPaused = false;

function checkGameOver() {
  if (livesCount !== Infinity && livesCount <= 0 && !isPaused) gameOver();
  else return;
};

function gameOver() {
  isPaused = true;
  synthManager.play('gameOver');
};

// ─── Config de la difficulté ────────────────────────────────────────────────────────
type Difficulty = 'easy' | 'medium' | 'hard' | 'endless';

interface DifficultyConfig {
  lives: number;
  spawnInterval: number;
  floorBounciness: number;       // piece ↔ floor bounciness
  floorFriction: number;         // piece ↔ floor friction
  pieceBounciness: number;       // piece ↔ piece bounciness
  pieceFriction: number;         // piece ↔ piece friction
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  //            lives  spawn  floorB floorF pieceB pieceF
  easy: { lives: 5, spawnInterval: 7, floorBounciness: 0.1, floorFriction: 0.6, pieceBounciness: 0.1, pieceFriction: 0.8 },
  medium: { lives: 3, spawnInterval: 5, floorBounciness: 0.2, floorFriction: 0.1, pieceBounciness: 0.2, pieceFriction: 0.5 },
  hard: { lives: 3, spawnInterval: 3, floorBounciness: 0.24, floorFriction: 0.05, pieceBounciness: 0.25, pieceFriction: 0.2 },
  endless: { lives: Infinity, spawnInterval: 2.5, floorBounciness: 0.2, floorFriction: 0.1, pieceBounciness: 0.2, pieceFriction: 0.5 },
};

const startScreen = document.getElementById('start-screen')!;

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const difficulty = (btn as HTMLElement).dataset.difficulty as Difficulty;
    const cfg = DIFFICULTY_CONFIG[difficulty];

    livesCount = cfg.lives;
    spawnInterval = cfg.spawnInterval;
    PieceToFloorBounciness = cfg.floorBounciness;
    PieceToFloorFriction = cfg.floorFriction;
    PieceToPieceBounciness = cfg.pieceBounciness;
    PieceToPieceFriction = cfg.pieceFriction;
    startScreen.style.display = 'none';
    render();
  }, { once: true });
});



// ─── Helper: build Three.js geometry from config ──────────────────────────────
function buildGeometry(config: PieceConfig): BufferGeometry {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new BoxGeometry(s * 2, s * 2, s * 2);
    case 'cylinder': return new CylinderGeometry(s, s, s * 2, 16);
    case 'cone': return new CylinderGeometry(0, s, s * 2, 16);
    case 'bigRect': return new BoxGeometry(s * 4, s * 1.5, s * 2);
    case 'thinRect': return new BoxGeometry(s * 0.5, s * 3, s * 2);
  }
}

// ─── Helper: build Cannon-ES shape from config ────────────────────────────────
function buildPhysicsShape(config: PieceConfig) {
  const s = config.size;
  switch (config.shape) {
    case 'cube': return new Box(new Vec3(s, s, s));
    case 'cylinder': return new Cylinder(s, s, s * 2, 16);
    case 'cone': return new Cylinder(0.01, s, s * 2, 16); // cannon-es doesn't support radius 0
    case 'bigRect': return new Box(new Vec3(s * 2, s * 0.75, s));
    case 'thinRect': return new Box(new Vec3(s * 0.25, s * 1.5, s));
  }
}

//  ─── Les débris ────────────────────────────────
function breakPiece(piece: { group: Group, body: Body, physMat: Material }) {
  const pos = piece.body.position;
  const vel = piece.body.velocity;
  const color = ((piece.group.children[0] as Mesh).material as MeshStandardMaterial).color.getHex();

  // Supprimer la pièce originale
  scene.remove(piece.group);
  physicsWorld.removeBody(piece.body);

  // Générer les débris
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const fragSize = 0.2 + Math.random() * 0.60;

    const fragGroup = new Group();
    const fragMesh = new Mesh(
      new BoxGeometry(fragSize * 2, fragSize * 2, fragSize * 2),
      new MeshStandardMaterial({ color, roughness: 1.0, transparent: true, opacity: 1.0 })
    );
    // fragMesh.castShadow = true;
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
    debris.push({ group: fragGroup, body: fragBody, spawnTime: clock.getElapsedTime() });
  }
}

function createPiece(config: PieceConfig) {
  // côté Three.js 
  const group = new Group();
  const mesh = new Mesh(buildGeometry(config), new MeshStandardMaterial({ color: pieceColor }));
  mesh.castShadow = true;
  group.add(mesh);
  scene.add(group);

  // côté Cannon-ES 
  const physMat = new Material();
  const body = new Body({
    mass: config.mass,
    type: Body.KINEMATIC, // Ne bouge pas tant qu'elle n'est pas "réveillée"
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

  // Pour gérer les collisions de la pièce
  body.addEventListener('collide', (event: any) => {
    const otherBody: Body = event.body;
    // Collision avec le sol
    if (otherBody === floorBody) {
      if (!piecesToBreak.includes(piece)) {
        synthManager.play('blockDestruction');
        piecesToBreak.push(piece);
        livesCount--;
      }
      return;
    }

    // Collision avec autre chose
    // On le met dans les pièces stackées et on relance la création d'une nouvelle pièce
    if (fallingPiece && fallingPiece.body === body) {
      synthManager.play('blockHit');
      stackedPieces.push(fallingPiece);
      (fallingPiece as any) = null;
      lastSpawnTime = clock.getElapsedTime(); // le délai commence maintenant
    }
  });


  return { group, body, physMat };
}

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
const PLATFORM_DIM = 18;

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

// ─── Fonction de level up ─────────────────────────────────────────────────────────────────
function randomColor(): number {
  return crypto.getRandomValues(new Uint8Array(3)).reduce((acc, val) => (acc << 8) | val, 0);
}


function levelUp() {
  CEIL += CEIL_INCREMENT;
  spawnPointPosition.y += CEIL_INCREMENT;
  synthManager.play('levelUp');
  pieceColor = randomColor();
}

//  ─── Fonction d'initialisation de la scène ─────────────────────────────────────────────────────────────────
function init() {

  const container = document.getElementById('container');

  // On met la caméra à son état normal en début de partie
  resetCamera();

  scene = new Scene();
  scene.background = new Color().setHSL(0.6, 0, 1);
  scene.fog = new Fog(scene.background, 1, 5000);

  // Lumières !
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
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container!.appendChild(renderer.domElement);

  // La boucle de postprocessing
  composer = new EffectComposer(renderer);
  const renderPixelatedPass = new RenderPixelatedPass(6, scene, camera);
  composer.addPass(renderPixelatedPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Contrôles du spawn point
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') spawnPointPosition.z += - 1;
    if (event.key === 'ArrowDown') spawnPointPosition.z += 1;
    if (event.key === 'ArrowLeft') spawnPointPosition.x += - 1;
    if (event.key === 'ArrowRight') spawnPointPosition.x += 1;

    spawnPointPosition.x = Math.max(-PLATFORM_DIM / 2, Math.min(PLATFORM_DIM / 2, spawnPointPosition.x));
    spawnPointPosition.z = Math.max(-PLATFORM_DIM / 2, Math.min(PLATFORM_DIM / 2, spawnPointPosition.z));

    if (event.key === 'r' && waitingPiece) {
      const euler = new Vec3();
      waitingPiece.body.quaternion.toEuler(euler);
      waitingPiece.body.quaternion.setFromEuler(euler.x, euler.y + Math.PI / 2, euler.z);
      waitingPiece.group.quaternion.copy(waitingPiece.body.quaternion as any);
    }
    if (event.key === 't' && waitingPiece) {
      const euler = new Vec3();
      waitingPiece.body.quaternion.toEuler(euler);
      waitingPiece.body.quaternion.setFromEuler(euler.x, euler.y, euler.z + Math.PI / 2);
      waitingPiece.group.quaternion.copy(waitingPiece.body.quaternion as any);
    }

  });

  // On crée une nouvelle pièce dès que l'on cliclk
  window.addEventListener('click', () => {
    releasePiece();
  });

  // On crée nos objets
  createFloor(-5); // Le sol
  createSpawnPoint(); // Le point de spawn
  createPlatform(0, -2, 0, PLATFORM_DIM, 1, PLATFORM_DIM); // La petite plateforme

}

//  ─── Boucle de rendering ─────────────────────────────────────────────────────────────────
function render() {
  physicsWorld.fixedStep();

  const currentTime = clock.getElapsedTime();


  // Génération des débris
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

  // Créer une pièce en attente si aucune n'existe
  if (!waitingPiece && !fallingPiece && !isPaused) {
    createWaitingPiece();
  }

  // Auto-release après le timer
  if (waitingPiece && !isPaused && clock.getElapsedTime() - waitingPieceSpawnTime >= spawnInterval) {
    releasePiece();
  }

  // La pièce en attente suit le spawn point
  if (waitingPiece) {
    waitingPiece.body.position.copy(spawnPointPosition);
    waitingPiece.group.position.copy(waitingPiece.body.position as any);
  }

  // La pièce qui tombe suit la physique normalement
  if (fallingPiece) {
    fallingPiece.group.position.copy(fallingPiece.body.position as any);
    fallingPiece.group.quaternion.copy(fallingPiece.body.quaternion as any);
  }


  // Update all cubes to match their physics bodies
  stackedPieces.forEach(({ group, body }) => {
    group.position.copy(body.position as any);
    group.quaternion.copy(body.quaternion as any);
  });


  // ─── Vérification du plafond ──────────────────────────────────────
  stackedPieces.forEach(({ body }) => {
    if (body.position.y > CEIL && !piecesAboveCeil.has(body)) {
      piecesAboveCeil.add(body);
      levelUp();
    }
  });

  // ─── Gestion des débris ──────────────────────────────────────
  // On filtre les débris 
  debris = debris.filter(({ group, body, spawnTime }) => {
    const age = currentTime - spawnTime; // l'âge du débris

    if (age >= DEBRIS_LIFETIME) { // Si le débris a dépassé le DEBRIS_LIFETIME, one le supprime
      scene.remove(group);
      physicsWorld.removeBody(body);
      return false;
    }

    // Update de la position
    group.position.copy(body.position as any);
    group.quaternion.copy(body.quaternion as any);

    // le fading du cube
    if (age > FADE_START) {
      const opacity = 1 - (age - FADE_START) / (DEBRIS_LIFETIME - FADE_START);
      (group.children[0] as Mesh).material &&
        (((group.children[0] as Mesh).material as MeshStandardMaterial).opacity = opacity);
    }

    return true;
  });

  checkGameOver();
  updateCameraOrbit();
  updateSpawnPoint(scene.getObjectByName("spawnPoint"));
  composer.render();
  requestAnimationFrame(render);
}


const playBtn = document.getElementById('play-btn')!;

init();

playBtn.addEventListener('click', () => {
  startScreen.style.display = 'none'; // On enlève l'écran "startgame"
  render();
}, { once: true });

window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

