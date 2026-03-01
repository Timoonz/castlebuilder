"use strict";
import { PerspectiveCamera, Scene, WebGLRenderer, BoxGeometry, Mesh, AmbientLight, Clock, Group, MeshStandardMaterial, Fog, Color, PlaneGeometry, Vector3, PointLight, CylinderGeometry } from 'three';
import { Body, Box, Plane, Vec3, World, Material, ContactMaterial, Cylinder, } from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/Addons.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SynthManager } from "./src/SynthManager";
// ─── Caméra / scène / renderer ───────────────────────────────────────────────
var scene;
var composer;
var camera = new PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 5000);
var renderer = new WebGLRenderer({ antialias: true });
// ─── Gestion du ceiling ───────────────────────────────────────────────
var CEIL = 10;
var CEIL_INCREMENT = 10;
var piecesAboveCeil = new Set();
// ─── Gestion des niveaux ───────────────────────────────────────────────
// const LEVEL_STEP = 20;
var pieceColor = 0x8e44ad;
// ─── Contrôles de la caméra ───────────────────────────────────────────────
var ORBIT_RADIUS = Math.sqrt(2800);
var cameraAngle = Math.atan2(10, 50);
var CAMERA_SPEED = 0.03;
var cameraAbove = false;
// Pour éviter d'avoir à recréer un "eventListener" à chaque tour de boucle
// Puisque l'on veut que la caméra s'update à chaque frame
var keysDown = {};
window.addEventListener('keydown', function (e) {
    keysDown[e.key] = true;
    if (e.key === 'z')
        cameraAbove = !cameraAbove; // Si on appuie sur z, alors on passe en mode "vue de dessus"
});
window.addEventListener('keyup', function (e) { keysDown[e.key] = false; });
// Piur remettre la caméra à son état "normal"
function resetCamera() {
    camera.position.set(Math.sin(cameraAngle) * ORBIT_RADIUS, CEIL + 10, // On met la caméra au-dessus du plafond
    Math.cos(cameraAngle) * ORBIT_RADIUS);
}
// Pour mettre la caméra en vue de dessus
function setCameraAbove() {
    camera.position.set(0, CEIL + 20, 0);
}
function updateCameraOrbit() {
    if (cameraAbove) { // Si la caméra doit être mise en vue de dessus, alors on la met
        setCameraAbove();
    }
    else {
        // Sin on appuie sur 'q' ou 'd', ou bouge à gauche/droite sur le cercle
        if (keysDown['q'])
            cameraAngle -= CAMERA_SPEED;
        if (keysDown['d'])
            cameraAngle += CAMERA_SPEED;
        resetCamera();
    }
    camera.lookAt(0, CEIL - 10, 0);
}
// ─── Audio ───────────────────────────────────────────────
var synthManager = new SynthManager();
// Une histoire de contexte audio à remplacer pour zzfx
var unlockAudio = function () {
    var ctx = new AudioContext();
    ctx.resume().then(function () { return ctx.close(); });
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);
//─── Temps ─────────────────────────────────────────────────────────────────────
var clock = new Clock();
var lastSpawnTime = 0;
var spawnInterval = 5;
var PIECES = {
    cube: {
        shape: 'cube',
        size: 1.5,
        mass: 1.0,
        color: 0x0095dd,
    },
    cylinder: {
        shape: 'cylinder',
        size: 1.5,
        mass: 1.0,
        color: 0x8e44ad,
    },
};
var currentPiece = 'cylinder';
// Le cube qui tombe
var fallingPiece;
// Liste des cubes stackés
var stackedPieces = [];
// Les pièces qui sont tombées sur le sol et qui sont à casser
var piecesToBreak = [];
var DEBRIS_COUNT = 6; // En combien de débris on veut que les pièces se cassent
var DEBRIS_LIFETIME = 4; // Le temps à partir duquel les débris disparaîssent cimplètement
var FADE_START = DEBRIS_LIFETIME * 0.5; // Le temps à partir duquel les débris commencent à fader
// Les débris des pièces cassées
var debris = [];
//─── Point de spawn ─────────────────────────────────────────────────────────────────────
var spawnPointPosition = new Vec3(0, CEIL + 5, 0);
//─── Monde physique ─────────────────────────────────────────────────────────────────────
var physicsWorld = new World({
    gravity: new Vec3(0, -5, 0),
});
// ─── Matériaux physiques ───────────────────────────────────────────────────────
var floorPhysMaterial = new Material();
// Piece ↔ floor
var PieceToFloorBounciness = 0.0; //  ─── Listener:  ─────────────────────────────────────────────────────────────────
var PieceToFloorFriction = 0.5;
// Piece ↔ piece
var PieceToPieceBounciness = 0.0;
var PieceToPieceFriction = 1.0;
// ─── Helper: build Three.js geometry from config ──────────────────────────────
function buildGeometry(config) {
    var s = config.size;
    switch (config.shape) {
        case 'cube': return new BoxGeometry(s * 2, s * 2, s * 2);
        case 'cylinder': return new CylinderGeometry(s, s, s * 2, 16);
    }
}
// ─── Helper: build Cannon-ES shape from config ────────────────────────────────
function buildPhysicsShape(config) {
    var s = config.size;
    switch (config.shape) {
        case 'cube': return new Box(new Vec3(s, s, s));
        case 'cylinder': return new Cylinder(s, s, s * 2, 16);
    }
}
//  ─── Les débris ────────────────────────────────
function breakPiece(piece) {
    var pos = piece.body.position;
    var vel = piece.body.velocity;
    var color = piece.group.children[0].material.color.getHex();
    // Supprimer la pièce originale
    scene.remove(piece.group);
    physicsWorld.removeBody(piece.body);
    // Générer les débris
    for (var i = 0; i < DEBRIS_COUNT; i++) {
        var fragSize = 0.2 + Math.random() * 0.60;
        var fragGroup = new Group();
        var fragMesh = new Mesh(new BoxGeometry(fragSize * 2, fragSize * 2, fragSize * 2), new MeshStandardMaterial({ color: color, roughness: 1.0, transparent: true, opacity: 1.0 }));
        // fragMesh.castShadow = true;
        fragGroup.add(fragMesh);
        scene.add(fragGroup);
        var fragBody = new Body({
            mass: 0.1,
            shape: new Box(new Vec3(fragSize, fragSize, fragSize)),
            linearDamping: 0.4,
            angularDamping: 0.4,
        });
        // Position dispersée autour du centre de la pièce
        fragBody.position.set(pos.x + (Math.random() - 0.5) * 1.2, pos.y + (Math.random() - 0.5) * 0.5, pos.z + (Math.random() - 0.5) * 1.2);
        // Vélocité : hérite de l'impact + dispersion latérale
        var spread = 3;
        fragBody.velocity.set(vel.x * 0.3 + (Math.random() - 0.5) * spread, Math.random() * 2, vel.z * 0.3 + (Math.random() - 0.5) * spread);
        fragBody.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        physicsWorld.addBody(fragBody);
        debris.push({ group: fragGroup, body: fragBody, spawnTime: clock.getElapsedTime() });
    }
}
function createPiece(config) {
    // côté Three.js 
    var group = new Group();
    var mesh = new Mesh(buildGeometry(config), new MeshStandardMaterial({ color: pieceColor }));
    mesh.castShadow = true;
    group.add(mesh);
    scene.add(group);
    // côté Cannon-ES 
    var physMat = new Material();
    var body = new Body({
        mass: config.mass,
        material: physMat,
        shape: buildPhysicsShape(config),
        sleepTimeLimit: 0.1,
    });
    body.position.copy(spawnPointPosition);
    group.position.copy(body.position);
    physicsWorld.addBody(body);
    // Contact: pièce ↔ sol
    physicsWorld.addContactMaterial(new ContactMaterial(floorPhysMaterial, physMat, {
        friction: PieceToFloorFriction,
        restitution: PieceToFloorBounciness,
    }));
    // Contact: pièce ↔ pièces
    stackedPieces.forEach(function (_a) {
        var existingMat = _a.physMat;
        physicsWorld.addContactMaterial(new ContactMaterial(existingMat, physMat, {
            friction: PieceToPieceFriction,
            restitution: PieceToPieceBounciness,
        }));
    });
    var piece = { group: group, body: body, physMat: physMat };
    // Pour gérer les collisions de la pièce
    body.addEventListener('collide', function (event) {
        var otherBody = event.body;
        // Collision avec le sol
        if (otherBody === floorBody) {
            if (!piecesToBreak.includes(piece)) {
                synthManager.play('blockDestruction');
                piecesToBreak.push(piece);
            }
            return;
        }
        // Collision avec autre chose
        // On le met dans les pièces stackées et on relance la création d'une nouvelle pièce
        if (fallingPiece && fallingPiece.body === body) {
            synthManager.play('blockHit');
            stackedPieces.push(fallingPiece);
            fallingPiece = null;
            lastSpawnTime = clock.getElapsedTime(); // le délai commence maintenant
        }
    });
    return { group: group, body: body, physMat: physMat };
}
//  ─── SpawnPoint ─────────────────────────────────────────────────────────────────
function createSpawnPoint() {
    var spawnPointGeom = new BoxGeometry(1.0, 1.0, 1.0);
    var spawnPointMaterial = new MeshStandardMaterial({ color: 0xb20000 });
    var spawnPoint = new Mesh(spawnPointGeom, spawnPointMaterial);
    spawnPoint.name = "spawnPoint";
    spawnPoint.position.set(spawnPointPosition.x, spawnPointPosition.y, spawnPointPosition.z);
    var spawnPointGroup = new Group();
    spawnPointGroup.add(spawnPoint);
    scene.add(spawnPointGroup);
}
function updateSpawnPoint(spawnPoint) {
    spawnPoint.position.set(spawnPointPosition.x, spawnPointPosition.y, spawnPointPosition.z);
}
// ─── Plateforme ─────────────────────────────────────────────────────────────────
function createPlatform(x, y, z, width, height, depth) {
    var platformMesh = new Mesh(new BoxGeometry(width, height, depth), new MeshStandardMaterial({ color: 0x7ec850, roughness: 0.9, metalness: 0.0 }));
    platformMesh.position.set(x, y, z);
    platformMesh.receiveShadow = true;
    platformMesh.castShadow = true;
    scene.add(platformMesh);
    var platformBody = new Body({
        type: Body.STATIC,
        material: floorPhysMaterial,
        shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
    });
    platformBody.position.set(x, y, z);
    physicsWorld.addBody(platformBody);
}
//  ─── Sol ─────────────────────────────────────────────────────────────────
var floorBody; // le coprs physique du sol, pour qu'il soit accessible partout
function createFloor(y) {
    var floor = new Mesh(new PlaneGeometry(1000, 1000), new MeshStandardMaterial({
        color: 0xF0ccc0,
        roughness: 0.8,
        metalness: 0.2
    }));
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
function randomColor() {
    return crypto.getRandomValues(new Uint8Array(3)).reduce(function (acc, val) { return (acc << 8) | val; }, 0);
}
function levelUp() {
    CEIL += CEIL_INCREMENT;
    spawnPointPosition.y += CEIL_INCREMENT;
    synthManager.play('levelUp');
    pieceColor = randomColor();
}
//  ─── Fonction d'initialisation de la scène ─────────────────────────────────────────────────────────────────
function init() {
    var container = document.getElementById('container');
    // On met la caméra à son état normal en début de partie
    resetCamera();
    scene = new Scene();
    scene.background = new Color().setHSL(0.6, 0, 1);
    scene.fog = new Fog(scene.background, 1, 5000);
    // Lumières !
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
    // Le renderer 
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    // La boucle de postprocessing
    composer = new EffectComposer(renderer);
    var renderPixelatedPass = new RenderPixelatedPass(6, scene, camera);
    composer.addPass(renderPixelatedPass);
    var outputPass = new OutputPass();
    composer.addPass(outputPass);
    // Contrôles du spawn point
    window.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowUp')
            spawnPointPosition.z += -1;
        if (event.key === 'ArrowDown')
            spawnPointPosition.z += 1;
        if (event.key === 'ArrowLeft')
            spawnPointPosition.x += -1;
        if (event.key === 'ArrowRight')
            spawnPointPosition.x += 1;
    });
    // On crée nos objets
    createFloor(-5); // Le sol
    createSpawnPoint(); // Le point de spawn
    createPlatform(0, -2, 0, 24, 1, 24); // La petite plateforme
}
//  ─── Boucle de rendering ─────────────────────────────────────────────────────────────────
function render() {
    physicsWorld.fixedStep();
    var currentTime = clock.getElapsedTime();
    // Génération des débris
    if (piecesToBreak.length > 0) {
        piecesToBreak.forEach(function (piece) {
            stackedPieces = stackedPieces.filter(function (p) { return p.body !== piece.body; });
            if (fallingPiece && fallingPiece.body === piece.body) {
                fallingPiece = null;
            }
            breakPiece(piece);
        });
        piecesToBreak = [];
    }
    if (!fallingPiece && currentTime - lastSpawnTime >= spawnInterval) {
        fallingPiece = createPiece(PIECES[currentPiece]);
    }
    if (fallingPiece) {
        fallingPiece.group.position.copy(fallingPiece.body.position);
        fallingPiece.group.quaternion.copy(fallingPiece.body.quaternion);
    }
    // Update all cubes to match their physics bodies
    stackedPieces.forEach(function (_a) {
        var group = _a.group, body = _a.body;
        group.position.copy(body.position);
        group.quaternion.copy(body.quaternion);
    });
    // ─── Vérification du plafond ──────────────────────────────────────
    stackedPieces.forEach(function (_a) {
        var body = _a.body;
        if (body.position.y > CEIL && !piecesAboveCeil.has(body)) {
            piecesAboveCeil.add(body);
            levelUp();
        }
    });
    // ─── Gestion des débris ──────────────────────────────────────
    // On filtre les débris 
    debris = debris.filter(function (_a) {
        var group = _a.group, body = _a.body, spawnTime = _a.spawnTime;
        var age = currentTime - spawnTime; // l'âge du débris
        if (age >= DEBRIS_LIFETIME) { // Si le débris a dépassé le DEBRIS_LIFETIME, one le supprime
            scene.remove(group);
            physicsWorld.removeBody(body);
            return false;
        }
        // Update de la position
        group.position.copy(body.position);
        group.quaternion.copy(body.quaternion);
        // le fading du cube
        if (age > FADE_START) {
            var opacity = 1 - (age - FADE_START) / (DEBRIS_LIFETIME - FADE_START);
            group.children[0].material &&
                (group.children[0].material.opacity = opacity);
        }
        return true;
    });
    updateCameraOrbit();
    updateSpawnPoint(scene.getObjectByName("spawnPoint"));
    composer.render();
    requestAnimationFrame(render);
}
var startScreen = document.getElementById('start-screen');
var playBtn = document.getElementById('play-btn');
init();
playBtn.addEventListener('click', function () {
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
//# sourceMappingURL=main.js.map