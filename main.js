"use strict";
// ⚠️ DO NOT EDIT main.js DIRECTLY ⚠️
// This file is generated from the TypeScript source main.ts
// Any changes made here will be overwritten.
// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)
import { PerspectiveCamera, Scene, WebGLRenderer, Mesh, AmbientLight, Clock, SphereGeometry, MeshPhongMaterial, Object3D } from 'three';
// If you prefer to import the whole library, with the THREE prefix, use the following line instead:
// import * as THREE from 'three'
// NOTE: three/addons alias is supported by Rollup: you can use it interchangeably with three/examples/jsm/  
// Importing Ammo can be tricky.
// Vite supports webassembly: https://vitejs.dev/guide/features.html#webassembly
// so in theory this should work:
//
// import ammoinit from 'three/addons/libs/ammo.wasm.js?init';
// ammoinit().then((AmmoLib) => {
//  Ammo = AmmoLib.exports.Ammo()
// })
//
// But the Ammo lib bundled with the THREE js examples does not seem to export modules properly.
// A solution is to treat this library as a standalone file and copy it using 'vite-plugin-static-copy'.
// See vite.config.js
// 
// Consider using alternatives like Oimo or cannon-es
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Example of hard link to official repo for data, if needed
// const MODEL_PATH = 'https://raw.githubusercontent.com/mrdoob/three.js/r173/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';
// INSERT CODE HERE
// Les objets qui vont tourner
var objects = [];
var scene = new Scene();
var aspect = window.innerWidth / window.innerHeight;
var camera = new PerspectiveCamera(75, aspect, 0.1, 1000);
var light = new AmbientLight(0xffffff, 1.0); // soft white light
scene.add(light);
var renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
var controls = new OrbitControls(camera, renderer.domElement);
controls.listenToKeyEvents(window); // optional
// HERE COMES THE SUN
var sunOrbit = new Object3D();
var sunGeometry = new SphereGeometry(3.6, 32, 16);
var sunMaterial = new MeshPhongMaterial({ emissive: 0xFFD140 });
var sun = new Mesh(sunGeometry, sunMaterial);
sunOrbit.add(sun);
objects.push(sun);
// MOTHER EARTH
var earthOrbit = new Object3D();
sunOrbit.add(earthOrbit);
var earthGeometry = new SphereGeometry(1.6, 32, 16);
var earthMaterial = new MeshPhongMaterial({ color: 0x2233FF, emissive: 0x112244 });
var earth = new Mesh(earthGeometry, earthMaterial);
earthOrbit.add(earth);
objects.push(earth);
earthOrbit.position.x = 9;
// BARK AT THE MOON
var moonOrbit = new Object3D();
earthOrbit.add(moonOrbit);
var moonGeometry = new SphereGeometry(0.5, 32, 16);
var moonMaterial = new MeshPhongMaterial({ emissive: 0x677179 });
var moon = new Mesh(moonGeometry, moonMaterial);
moonOrbit.add(moon);
objects.push(moon);
moon.position.x = 4;
scene.add(sunOrbit);
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
camera.position.z = 25;
var clock = new Clock();
// Main loop
// const animation = () => {
//   renderer.setAnimationLoop(animation); // requestAnimationFrame() replacement, compatible with XR 
//   const delta = clock.getDelta();
//   const elapsed = clock.getElapsedTime();
//   // can be used in shaders: uniforms.u_time.value = elapsed;
//   objects.forEach((obj) => {
//     obj.rotation.y = elapsed;
//   });
//   renderer.render(scene, camera);
// };
// animation();
function render(time) {
    time *= 0.002;
    // objects.forEach( ( obj ) => {
    // 	obj.rotation.y = time;
    // } );
    sunOrbit.rotation.y = time * 0.2;
    earthOrbit.rotation.y = time * 1.0;
    moonOrbit.rotation.y = time * 2.0;
    renderer.render(scene, camera);
    requestAnimationFrame(render);
}
requestAnimationFrame(render);
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
//# sourceMappingURL=main.js.map