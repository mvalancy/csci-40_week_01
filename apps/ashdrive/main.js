import * as THREE from 'three';
import { createRendering } from './rendering.js';
import { angleDelta, segmentHit3D as segmentHit } from './gameplay.js';
import { createWorld } from './world.js';
import { createCombatBike } from './bike.js';
import { createEffects } from './effects.js';
import { createEnemy, disposeEnemy } from './enemies.js';
import { createMission } from './missions.js';
import { createEnvironment } from './environment.js';
import { createNavigation } from './navigation.js';
import { createAudio } from './audio.js';
import { stepVertical } from './physics.js';
import { buildRoute } from './route.js';
import { createTacticalMap } from './tactical-map.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#77776a');
scene.fog = new THREE.FogExp2('#77776a', .003);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .35, 1100);
scene.add(new THREE.HemisphereLight('#e6dfcb', '#474435', 2.1));
const sunlight = new THREE.DirectionalLight('#ffe0af', 3.2); sunlight.position.set(-100, 150, -120); scene.add(sunlight);
sunlight.castShadow = true; sunlight.shadow.mapSize.set(1024, 1024);
Object.assign(sunlight.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 350 });
sunlight.shadow.bias = -.0008; sunlight.shadow.normalBias = .65; scene.add(sunlight.target);
const world = createWorld(THREE, scene);
const bike = createCombatBike(THREE); scene.add(bike); bike.traverse(m => { if (m.isMesh) m.castShadow = true; });
const fx = createEffects(THREE, scene);
const mission = createMission(THREE, scene, world);
const navigation = createNavigation(THREE, camera);
const tacticalMap = createTacticalMap(world);
let mapPreviousMode = 'playing';
let graphics, renderDirty = true;
try { graphics = await createRendering($('world'), scene, camera); }
catch (error) { $('loading').textContent = 'GRAPHICS UNAVAILABLE — PLEASE TRY AN UPDATED BROWSER'; throw error; }
const { renderer } = graphics; renderer.domElement.tabIndex = 0;
scene.environment = createEnvironment(THREE); scene.environmentIntensity = .85;
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const metal = new THREE.MeshStandardMaterial({ color: '#41483d', metalness: .7, roughness: .6 });
const shotMaterial = new THREE.MeshBasicMaterial({ color: '#ffe3a3' });
const hostileMaterial = new THREE.MeshBasicMaterial({ color: '#ff713e' });
const green = new THREE.MeshStandardMaterial({ color: '#91a169', emissive: '#7e9b48', emissiveIntensity: .3 });
function box(parent, size, pos, material = metal) { const m = new THREE.Mesh(boxGeometry, material); m.scale.set(...size); m.position.set(...pos); parent.add(m); return m; }
const keys = new Set();
const state = window.__app = { ready: false, frames: 0, backend: graphics.backend, fps: 0, mode: 'menu', health: 100, energy: 100, score: 0, wave: 1, speed: 0, shots: 0, kills: 0, x: world.spawnPoint.x, y: world.spawnPoint.y, z: world.spawnPoint.z, heading: 0, boosted: false, autopilot: false, missiles: 8, missilesFired: 0, empCooldown: 0, empUses: 0, camera: 'chase', enemies: 0, airborne: false };
let enemies = [], bullets = [], pickups = [];
let vertical = { y: world.spawnPoint.y, vy: 0, grounded: true, previousFloor: world.spawnPoint.y };
let autoRoute = [], autoObjective = -1, autoRouteKey = '', autoCollision = 0;
let speed = 0, heading = 0, shootTimer = 0, missileTimer = 0, spawnTimer = 0, hitTimer = 0, noticeTimer = 0, elapsed = 0, dustTimer = 0, uiTimer = 0, cameraShake = 0, muzzleSide = 1;
const sound = createAudio();
let seed = 94;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function announce(text, duration = 2.5) { $('notice').textContent = text; noticeTimer = duration; }
function clean(items) { for (const item of items) { scene.remove(item.mesh); if (items === enemies) disposeEnemy(item.mesh); } items.length = 0; }
function start(autopilot = false) {
  for (const list of [enemies, bullets, pickups]) clean(list); fx.clear(); mission.reset();
  Object.assign(state, { mode: 'playing', freeRoam: false, health: 100, energy: 100, score: 0, wave: 1, shots: 0, kills: 0, speed: 0, boosted: false, x: world.spawnPoint.x, y: world.spawnPoint.y, z: world.spawnPoint.z, heading: 0, autopilot, missiles: 8, missilesFired: 0, empCooldown: 0, empUses: 0, camera: 'chase', mission: mission.snapshot() });
  bike.position.set(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z); bike.rotation.set(0, 0, 0); bike.visible = true;
  speed = 0; heading = 0; vertical = { y: world.spawnPoint.y, vy: 0, grounded: true, previousFloor: world.spawnPoint.y }; autoRoute = []; autoObjective = -1; autoRouteKey = ''; autoCollision = 0; tacticalMap.close(); shootTimer = 0; missileTimer = 0; spawnTimer = 0; hitTimer = 1.5; cameraShake = 0; keys.clear(); seed = 94;
  camera.fov = 62; camera.updateProjectionMatrix(); camera.position.set(bike.position.x, bike.position.y + 6, bike.position.z + 11);
  $('menu').hidden = true; $('end').hidden = true;
  if(graphics.quality.mode === 'auto') graphics.setQuality('auto');
  sound.start(); spawnWave();
}
function spawnWave() {
  const count = Math.min(3 + state.wave, 12);
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    const type = i === 0 && state.wave > 1 ? 'gunship' : i === 1 && state.wave > 1 ? 'turret' : 'drone';
    const mesh = createEnemy(THREE, type);
    const x = THREE.MathUtils.clamp(bike.position.x + Math.sin(angle) * 55, -205, 205), z = THREE.MathUtils.clamp(bike.position.z - 35 + Math.cos(angle) * 55, -205, 205);
    mesh.position.set(x, world.heightAt(x, z) + (type === 'gunship' ? 13 : type === 'turret' ? 1.1 : 2.4), z);
    mesh.traverse(m => { if (m.isMesh) m.castShadow = true; }); scene.add(mesh);
    enemies.push({ mesh, health: (type === 'gunship' ? 10 : type === 'turret' ? 6 : 3) + Math.floor(state.wave / 3), cooldown: 2 + i * .5, phase: random() * 6, salvo: 0, type, radius: type === 'gunship' ? 4 : 2.5 });
  }
  announce(`DEFENSE WAVE ${String(state.wave).padStart(2, '0')} / WEAPONS FREE`);
}
function end(won = false) {
  $('continue').hidden = !won;
  state.mode = won ? 'victory' : 'over'; $('end').hidden = false; $('end').querySelector('.eyebrow').textContent = won ? 'OPERATION COMPLETE / DATA SECURED' : 'REMOTE LINK LOST'; $('end').querySelector('h2').innerHTML = won ? 'MISSION<br>COMPLETE.' : 'MACHINE<br>DOWN.';
  $('result').textContent = `${state.score.toLocaleString()} BOUNTY / WAVE ${state.wave} / ${state.kills} TAKEDOWNS`;
  if (!won) fx.explode(bike.position.clone().add(new THREE.Vector3(0, 1, 0)), 2.3);
}
function damage(amount) {
  if (hitTimer > 0 || state.mode !== 'playing') return;
  state.health = Math.max(0, state.health - amount); hitTimer = .55; cameraShake = .45; fx.hit(bike.position.clone().add(new THREE.Vector3(0, 1, 0))); sound.hit(); announce('ARMOR IMPACT');
  if (!state.health) end();
}
function nearestTarget(maxAngle = Math.PI, maxRange = 220) {
  let best = null;
  for (const target of [...enemies, ...mission.targets.filter(t => t.health > 0)]) {
    const p = target.mesh.position, distance = p.distanceTo(bike.position), angle = Math.atan2(bike.position.x - p.x, bike.position.z - p.z), difference = Math.abs(angleDelta(angle, heading));
    if (difference <= maxAngle && distance < maxRange && (!best || distance < best.distance)) best = { target, distance, angle };
  }
  return best;
}
function fire(origin, angle, hostile = false, target = null, missile = false) {
  const direction = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));
  const muzzle = origin.clone().add(new THREE.Vector3(0, hostile ? 0 : 1.35, 0));
  if (!hostile) { muzzle.x += Math.cos(angle) * .78 * muzzleSide; muzzle.z -= Math.sin(angle) * .78 * muzzleSide; muzzleSide *= -1; }
  muzzle.addScaledVector(direction, hostile ? 2 : 1.8);
  if (target) direction.copy(target.mesh.position).sub(muzzle).normalize();
  const mesh = box(scene, [missile ? .22 : .1, missile ? .22 : .1, missile ? 1.3 : 2.3], muzzle.toArray(), hostile ? hostileMaterial : shotMaterial);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  bullets.push({ mesh, velocity: direction.multiplyScalar(missile ? 52 : hostile ? 36 : 160), life: missile ? 5 : hostile ? 5 : 1.8, hostile, missile, target, smokeTimer: 0 });
  if (!hostile) { state.shots++; if (missile) { state.missiles--; state.missilesFired++; sound.missile(); } else sound.cannon(); cameraShake = Math.max(cameraShake, missile ? .15 : .025); fx.hit(muzzle, '#ffb54d'); }
}
function rocket() {
  if (state.mode !== 'playing' || missileTimer > 0) return;
  if (!state.missiles) { announce('MISSILE RACK EMPTY'); return; }
  const lock = nearestTarget(.95, 220);
  fire(bike.position, heading, false, lock?.target, true); missileTimer = .65;
}
function emp() {
  if (state.mode !== 'playing' || state.empCooldown > 0) return;
  state.empCooldown = 18; state.empUses++; cameraShake = .25; sound.explosion(.7); fx.explode(bike.position.clone().add(new THREE.Vector3(0, .7, 0)), 2, '#b4c7c0');
  for (const enemy of [...enemies]) if (enemy.mesh.position.distanceTo(bike.position) < 32) { enemy.cooldown = 6; hitEnemy(enemy, 4); }
  bullets.filter(b => b.hostile && b.mesh.position.distanceTo(bike.position) < 40).forEach(b => { b.life = 0; });
  announce('EMP DISCHARGED / DEFENSES DISRUPTED');
}
function hitEnemy(enemy, amount) {
  enemy.health -= amount;
  if (enemy.health > 0) { fx.hit(enemy.mesh.position); return; }
  const index = enemies.indexOf(enemy); if (index < 0) return;
  fx.explode(enemy.mesh.position, enemy.type === 'gunship' ? 2.1 : 1.1); sound.explosion(enemy.type === 'gunship' ? 1.6 : 1); cameraShake = Math.max(cameraShake, .13);
  state.score += 250 * state.wave; state.kills++; scene.remove(enemy.mesh); disposeEnemy(enemy.mesh); enemies.splice(index, 1);
  if (state.kills % 2 === 0) { const mesh = box(scene, [1.3, .8, 1.3], [enemy.mesh.position.x, world.heightAt(enemy.mesh.position.x, enemy.mesh.position.z, bike.position.y) + .7, enemy.mesh.position.z], green); pickups.push({ mesh, life: 35 }); }
  announce(`TARGET DESTROYED / +${250 * state.wave}`);
}
$('continue').onclick = () => { state.mode='playing'; state.freeRoam=true; $('end').hidden=true; announce('FREE EXPLORATION / SECTOR SECURED'); };
$('hangar').onclick = () => { state.mode = 'menu'; $('end').hidden = true; $('menu').hidden = false; bike.visible = true; };
function togglePause() { if(tacticalMap.visible)return; if (['playing', 'paused'].includes(state.mode)) { state.mode = state.mode === 'playing' ? 'paused' : 'playing'; announce(state.mode === 'paused' ? 'PAUSED / P TO RESUME' : 'REMOTE LINK ACTIVE', 3); } }
function changeCamera() { state.camera = state.camera === 'chase' ? 'cockpit' : state.camera === 'cockpit' ? 'tactical' : 'chase'; announce(`${state.camera.toUpperCase()} CAMERA`); }
function toggleMap() {
  if (!tacticalMap.visible && !['playing','paused'].includes(state.mode)) return;
  if (tacticalMap.visible) { tacticalMap.close(); state.mode=mapPreviousMode; }
  else { mapPreviousMode=state.mode; state.mode='paused'; keys.clear(); tacticalMap.toggle({position:bike.position,heading,mission:mission.snapshot(),targets:mission.targets,enemies}); }
}
addEventListener('cyber-map-close',()=>{state.mode=mapPreviousMode;});
$('map-toggle').onclick=toggleMap;
$('pause-toggle').onclick = togglePause;
$('quality-select').onchange = event => { graphics.setQuality(event.target.value); renderDirty=true; renderer.domElement.focus({preventScroll:true}); };
$('audio-toggle').onclick = () => { const muted = sound.toggle(); $('audio-toggle').textContent = muted ? 'MUTED' : 'SOUND'; };
for (const b of document.querySelectorAll('[data-action]')) b.onclick = () => ({ missile: rocket, emp, camera: changeCamera })[b.dataset.action]();
$('start').onclick = () => start(false); $('demo').onclick = () => start(true); $('restart').onclick = () => start(false);
addEventListener('keydown', event => {
  if (event.target instanceof HTMLSelectElement && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].includes(event.code)) return;
  if (state.mode === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code==='Tab') { if(tacticalMap.visible || ['playing','paused'].includes(state.mode)) { event.preventDefault(); if(!event.repeat)toggleMap(); } return; }
  if (event.code==='Escape' && tacticalMap.visible) { toggleMap(); return; }
  keys.add(event.code); if (event.repeat) return;
  if (event.code === 'KeyM') { const muted = sound.toggle(); announce(muted ? 'AUDIO OFF' : 'AUDIO ON'); }
  if (event.code === 'KeyQ') rocket(); if (event.code === 'KeyE') emp();
  if (event.code === 'KeyC') changeCamera();
  if (event.code === 'KeyP') togglePause();
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => { keys.clear(); if (state.mode === 'playing') { state.mode = 'paused'; announce('PAUSED / P TO RESUME', 5); } });
for (const button of document.querySelectorAll('[data-key]')) {
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.key); };
  button.onpointerup = button.onpointercancel = () => keys.delete(button.dataset.key);
}
function update(dt) {
  elapsed += dt; hitTimer -= dt; shootTimer -= dt; missileTimer -= dt; noticeTimer -= dt; cameraShake *= Math.exp(-dt * 7); state.empCooldown = Math.max(0, state.empCooldown - dt);
  if (noticeTimer < 0) $('notice').textContent = state.autopilot && state.mode === 'playing' ? 'AUTONOMOUS COMBAT SORTIE' : '';
  world.update(dt, elapsed, bike.position); fx.update(dt);
  if (state.mode === 'playing') {
    let throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    let steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    let firing = keys.has('Space'), boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (state.autopilot) {
      if (autoObjective < 0 || mission.targets[autoObjective]?.recovered) {
        const available = mission.targets.map((t,i) => ({t,i})).filter(({t}) => !t.recovered).sort((a,b) => a.t.mesh.position.distanceToSquared(bike.position)-b.t.mesh.position.distanceToSquared(bike.position));
        autoObjective = available[0]?.i ?? -1;
      }
      const objective = autoObjective >= 0 ? mission.targets[autoObjective] : null;
      const goal = objective ? objective.mesh.position.clone().add(new THREE.Vector3(0,-1.5,0)) : mission.extraction.clone();
      const routeKey = `${autoObjective}/${objective?.destroyed ? 'recover' : 'approach'}`;
      if (routeKey !== autoRouteKey) { autoRoute = buildRoute(bike.position, goal, world); autoRouteKey = routeKey; }
      while (autoRoute.length > 1 && Math.hypot(autoRoute[0].x-bike.position.x,autoRoute[0].z-bike.position.z)<4) autoRoute.shift();
      let target = autoRoute[0] || goal;
      const threats = enemies.filter(e => e.mesh.position.distanceTo(bike.position) < 42 && !world.segmentBlocked(bike.position.clone().add(new THREE.Vector3(0,1.5,0)),e.mesh.position)).sort((a,b)=>a.mesh.position.distanceToSquared(bike.position)-b.mesh.position.distanceToSquared(bike.position));
      const combat = threats[0];
      const attackingRelay = objective && objective.health > 0 && objective.mesh.position.distanceTo(bike.position) < 45 && !world.segmentBlocked(bike.position.clone().add(new THREE.Vector3(0,1.5,0)),objective.mesh.position);
      if (combat) target = combat.mesh.position; else if (attackingRelay) target = objective.mesh.position;
      const distance = Math.hypot(target.x-bike.position.x,target.z-bike.position.z);
      const desired = Math.atan2(bike.position.x-target.x,bike.position.z-target.z), diff = angleDelta(desired,heading);
      steer = THREE.MathUtils.clamp(diff*2.8,-1,1);
      throttle = Math.abs(diff)>.45 ? 0 : combat || attackingRelay ? 0 : Math.min(.62,distance/35+.12);
      firing = !!(combat || attackingRelay) && Math.abs(diff)<.16;
      if (firing && combat && missileTimer<=0 && state.missiles>1 && (combat.type==='gunship'||enemies.length>2)) { rocket(); missileTimer=2; }
      if (enemies.some(e=>e.mesh.position.distanceTo(bike.position)<28) && state.empCooldown===0) emp();
      if (autoCollision>0) { autoCollision-=dt; throttle=-.25; steer=.75; if(autoCollision<=0) { autoRoute=buildRoute(bike.position,goal,world); } }
      boost = false;
    }
    const boosting = boost && state.energy > 2 && throttle > 0;
    state.boosted = boosting; state.energy = THREE.MathUtils.clamp(state.energy + (boosting ? -27 : 15) * dt, 0, 100);
    speed = THREE.MathUtils.damp(speed, throttle * (boosting ? 53 : 30), throttle ? 2.2 : 1.3, dt);
    heading += steer * dt * (1.5 + Math.abs(speed) * .019) * (speed < -1 ? -1 : 1);
    const oldHeight = bike.position.y;
    bike.position.x -= Math.sin(heading) * speed * dt; bike.position.z -= Math.cos(heading) * speed * dt;
    if (Math.abs(bike.position.x) > world.bounds || Math.abs(bike.position.z) > world.bounds) { bike.position.x = THREE.MathUtils.clamp(bike.position.x, -world.bounds, world.bounds); bike.position.z = THREE.MathUtils.clamp(bike.position.z, -world.bounds, world.bounds); speed *= -.3; damage(10); }
    if (world.pushOut?.(bike.position, 1.1)) { speed *= -.25; if (Math.abs(speed)>4) damage(5); if(state.autopilot) autoCollision=1; }
    for (const relay of mission.targets) {
      if (relay.health <= 0 || Math.abs(bike.position.y - relay.mesh.position.y) > 4) continue;
      const dx = bike.position.x - relay.mesh.position.x, dz = bike.position.z - relay.mesh.position.z, length = Math.hypot(dx, dz);
      if (length < 3.5) { bike.position.x = relay.mesh.position.x + (length ? dx / length : 1) * 3.5; bike.position.z = relay.mesh.position.z + (length ? dz / length : 0) * 3.5; speed *= -.15; }
    }
    const floor = world.heightAt(bike.position.x, bike.position.z, oldHeight);
    vertical = stepVertical(vertical, floor, dt); bike.position.y = vertical.y; state.airborne = !vertical.grounded;
    if (vertical.landed && vertical.impact > 10) { cameraShake = Math.min(.5,vertical.impact*.02); fx.trail(bike.position,heading,true); }
    bike.rotation.set(THREE.MathUtils.damp(bike.rotation.x, state.airborne ? -.12 : -(floor - oldHeight) * 1.5, 8, dt), heading, -steer * Math.min(Math.abs(speed) / 105, .28));
    bike.userData.update?.(speed * dt);
    if (firing && shootTimer <= 0) { fire(bike.position, heading, false, nearestTarget(.14, 150)?.target); shootTimer = .12; }
    dustTimer -= dt; if (Math.abs(speed) > 5 && dustTimer <= 0) { fx.trail(bike.position, heading, boosting); dustTimer = boosting ? .05 : .1; }
    for (const enemy of enemies) {
      const delta = bike.position.clone().sub(enemy.mesh.position); delta.y = 0; const distance = delta.length();
      enemy.mesh.rotation.y = Math.atan2(-delta.x, -delta.z);
      if (enemy.type !== 'turret') {
        const altitude = enemy.type === 'gunship' ? 14 : 2.4;
        const targetHeight = Math.max(world.heightAt(enemy.mesh.position.x, enemy.mesh.position.z) + altitude, bike.position.y + altitude);
        enemy.mesh.position.y = THREE.MathUtils.damp(enemy.mesh.position.y, targetHeight + Math.sin(elapsed * 2 + enemy.phase) * .35, 2, dt);
        const range = enemy.type === 'gunship' ? 65 : 20;
        if (distance > range) enemy.mesh.position.addScaledVector(delta.normalize(), (6 + Math.min(state.wave, 8)) * dt);
        else if (distance < range - 7) enemy.mesh.position.addScaledVector(delta.normalize(), -5 * dt);
        if (enemy.type === 'gunship') { enemy.mesh.position.x += Math.cos(enemy.mesh.rotation.y) * 7 * dt; enemy.mesh.position.z -= Math.sin(enemy.mesh.rotation.y) * 7 * dt; enemy.mesh.rotation.z = Math.sin(elapsed + enemy.phase) * .09; }
      }
      enemy.cooldown -= dt;
      const aimPoint = bike.position.clone().add(new THREE.Vector3(0, 1, 0));
      if (enemy.cooldown <= 0 && distance < 150 && !world.segmentBlocked(enemy.mesh.position, aimPoint)) {
        fire(enemy.mesh.position, enemy.mesh.rotation.y, true, { mesh: { position: aimPoint } });
        enemy.salvo++;
        enemy.cooldown = enemy.type === 'gunship' && enemy.salvo % 3 ? .22 : Math.max(1.1, 3.2 - state.wave * .12) + random();
      }
      if (distance < 2.8 && Math.abs(enemy.mesh.position.y - bike.position.y) < 4) damage(12);
      enemy.mesh.userData.update?.(dt);
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.life <= 0) { scene.remove(b.mesh); bullets.splice(i, 1); continue; }
      const previous = b.mesh.position.clone();
      if (b.missile && b.target && (enemies.includes(b.target) || mission.targets.includes(b.target)) && b.target.health > 0) { const desired = b.target.mesh.position.clone().sub(b.mesh.position).normalize().multiplyScalar(70); b.velocity.lerp(desired, 1 - Math.exp(-dt * 4)); b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), b.velocity.clone().normalize()); }
      b.mesh.position.addScaledVector(b.velocity, dt); b.life -= dt;
      if (b.missile) { b.smokeTimer -= dt; if (b.smokeTimer <= 0) { fx.trail(b.mesh.position, Math.atan2(-b.velocity.x, -b.velocity.z), true); b.smokeTimer = .07; } }
      const obstacle = world.segmentHit(previous, b.mesh.position);
      if (obstacle) { b.mesh.position.set(obstacle.x, obstacle.y, obstacle.z); b.life = 0; if (b.missile) fx.explode(b.mesh.position, 1.3); else fx.hit(b.mesh.position); }
      if (!obstacle && b.hostile && segmentHit(previous, b.mesh.position, bike.position.clone().add(new THREE.Vector3(0, 1, 0)), 1.5)) { damage(8); b.life = 0; }
      if (!obstacle && !b.hostile) for (const enemy of [...enemies]) {
        if (segmentHit(previous, b.mesh.position, enemy.mesh.position, enemy.radius)) {
          b.life = 0; hitEnemy(enemy, b.missile ? 7 : 1);
          if (b.missile) { fx.explode(b.mesh.position, 1.4); for (const nearby of [...enemies]) if (nearby !== enemy && nearby.mesh.position.distanceTo(b.mesh.position) < 10) hitEnemy(nearby, 3); }
          break;
        }
      }
      if (!b.hostile && b.life > 0) for (const relay of mission.targets) {
        if (relay.health > 0 && segmentHit(previous, b.mesh.position, relay.mesh.position, 3)) {
          b.life = 0; const destroyed = mission.hit(relay, b.missile ? 7 : 1); fx.hit(b.mesh.position);
          if (destroyed) { fx.explode(relay.mesh.position, 2); state.score += 1000; announce('RELAY DISABLED / APPROACH TO RECOVER DATA'); sound.explosion(1.8); }
          break;
        }
      }
      if (b.mesh.position.y < 0 || Math.abs(b.mesh.position.x) > 270 || Math.abs(b.mesh.position.z) > 270) b.life = 0;
      if (b.life <= 0) { scene.remove(b.mesh); bullets.splice(i, 1); }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; p.life -= dt; p.mesh.rotation.y += dt;
      if (p.mesh.position.distanceTo(bike.position) < 5) { state.health = Math.min(100, state.health + 25); state.missiles = Math.min(12, state.missiles + 2); state.score += 100; announce('FIELD SUPPLY / ARMOR +25 / MISSILES +2'); sound.pickup(); p.life = 0; }
      if (p.life <= 0) { scene.remove(p.mesh); pickups.splice(i, 1); }
    }
    if (state.mode === 'playing') mission.update(dt, bike.position);
    const missionState = mission.snapshot();
    if (missionState.recovered > (state.mission?.recovered || 0)) { sound.pickup(); state.score += 1500; state.health = Math.min(100, state.health + 20); state.missiles = Math.min(12, state.missiles + 2); announce(`INTEL ${missionState.recovered}/3 SECURED / FIELD RESUPPLY`); }
    state.mission = missionState;
    if (state.mode === 'playing' && missionState.complete && !state.freeRoam) { state.score += 5000; end(true); }
    if (!enemies.length) { spawnTimer += dt; if (spawnTimer > 25) { state.wave++; state.health = Math.min(100, state.health + 15); state.missiles = Math.min(12, state.missiles + 2); spawnWave(); spawnTimer = 0; } }
  }
  sunlight.position.set(bike.position.x - 100, bike.position.y + 150, bike.position.z - 120); sunlight.target.position.copy(bike.position);
  updateCamera(dt);
  state.x = bike.position.x; state.y = bike.position.y; state.z = bike.position.z; state.speed = speed; state.heading = heading; state.enemies = enemies.length;
  sound.update({ speed, boosting: state.boosted, mode: state.mode }, dt);
  uiTimer -= dt; if (uiTimer <= 0) { hud(); uiTimer = .1; }
}
function updateCamera(dt) {
  if (state.mode === 'menu') {
    bike.position.set(3, 12, 40); bike.rotation.y = -.65;
    camera.position.set(10 + Math.sin(elapsed * .12) * .6, 15, 47); camera.lookAt(-1, 13.3, 39); return;
  }
  const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const target = bike.position.clone();
  if (state.camera === 'cockpit') { target.addScaledVector(forward, .3); target.y += 2.05; bike.visible = false; }
  else { target.addScaledVector(forward, state.camera === 'tactical' ? -19 : -9.5); target.y += state.camera === 'tactical' ? 18 : 4.4; bike.visible = true; }
  const cameraOrigin = bike.position.clone().add(new THREE.Vector3(0, 2, 0));
  const cameraBlock = world.segmentHit(cameraOrigin, target);
  if (cameraBlock) target.copy(cameraOrigin).lerp(new THREE.Vector3(cameraBlock.x, cameraBlock.y, cameraBlock.z), .85);
  camera.position.lerp(target, 1 - Math.exp(-dt * (state.camera === 'cockpit' ? 25 : 7)));
  camera.position.y += (random() - .5) * cameraShake;
  const look = bike.position.clone().addScaledVector(forward, state.camera === 'cockpit' ? 40 : 13); look.y += state.camera === 'cockpit' ? 2.05 : 1.5;
  camera.lookAt(look); camera.fov = THREE.MathUtils.damp(camera.fov, state.boosted ? 77 : state.camera === 'cockpit' ? 75 : 62, 4, dt); camera.updateProjectionMatrix();
}
const radar = $('radar').getContext('2d');
function hud() {
  document.body.dataset.mode = state.mode;
  state.quality = graphics.quality; world.setQuality?.(state.quality.tier);
  $('quality-status').textContent = `${state.fps || '—'} FPS / ${Math.round(state.quality.scale*100)}%`;
  $('quality-select').value = state.quality.mode;
  state.targets = enemies.map(e => ({ health: e.health, type: e.type, x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z, cooldown: e.cooldown }));
  state.projectiles = { hostile: bullets.filter(b => b.hostile && b.life > 0).length, missiles: bullets.filter(b => b.missile && b.life > 0).length };
  const missionInfo = mission.snapshot();
  const navMission = state.autopilot && autoObjective >= 0 && !mission.targets[autoObjective].recovered ? { ...missionInfo, targetPosition: mission.targets[autoObjective].position, phase: mission.targets[autoObjective].destroyed ? 'recover' : 'destroy' } : missionInfo;
  navigation.update({ bikePosition: bike.position, heading, mission: navMission, enemies, mode: state.mode });
  $('mission').textContent = `${missionInfo.recovered}/3 INTEL · ${missionInfo.objectiveText}`;
  $('score').textContent = String(state.score).padStart(6, '0'); $('wave').textContent = String(state.wave).padStart(2, '0'); $('hunters').textContent = `${enemies.length} HOSTILES`;
  $('health').style.width = `${state.health}%`; $('health-text').textContent = `${state.health}%`; $('boost').style.width = `${state.energy}%`; $('boost-text').textContent = state.energy > 20 ? 'READY' : 'RECHARGING';
  $('speed').textContent = String(Math.round(Math.abs(speed) * 5)).padStart(3, '0'); $('telemetry').querySelector('h2').textContent = world.districtAt?.(bike.position.x, bike.position.z) || 'SHADOW SECTOR';
  $('coords').textContent = `X ${bike.position.x.toFixed(0)} Z ${bike.position.z.toFixed(0)} / ${Math.round(bike.position.y)}M`;
  $('rockets').textContent = String(state.missiles).padStart(2, '0'); $('emp').textContent = state.empCooldown ? `${Math.ceil(state.empCooldown)}S` : 'READY'; $('damage-flash').style.opacity = hitTimer > 0 && state.health < 100 ? '.5' : '0';
  radar.clearRect(0, 0, 170, 170); radar.fillStyle = '#161e13de'; radar.fillRect(0, 0, 170, 170); radar.strokeStyle = '#8c9b6655'; radar.strokeRect(1, 1, 168, 168);
  const scale = .32; radar.fillStyle = '#5a6540'; radar.fillRect(85 - 14 * scale, 85 - 195 * scale, 28 * scale, 390 * scale); radar.fillRect(85 - 195 * scale, 85 - 100 * scale, 390 * scale, 24 * scale);
  for (const t of mission.targets.filter(t => !t.recovered)) { radar.fillStyle = t.health > 0 ? '#e5c77b' : '#bddeaa'; radar.strokeStyle = radar.fillStyle; radar.strokeRect(81 + t.mesh.position.x * scale, 81 + t.mesh.position.z * scale, 8, 8); }
  if (missionInfo.phase === 'extract') { radar.fillStyle = '#efe1a3'; radar.font = 'bold 12px monospace'; radar.fillText('H', 81 + mission.extraction.x * scale, 89 + mission.extraction.z * scale); }
  for (const e of enemies) { radar.fillStyle = '#ec985d'; radar.fillRect(83 + e.mesh.position.x * scale, 83 + e.mesh.position.z * scale, 4, 4); }
  for (const p of pickups) { radar.fillStyle = '#baca91'; radar.fillRect(83 + p.mesh.position.x * scale, 83 + p.mesh.position.z * scale, 4, 4); }
  radar.save(); radar.translate(85 + bike.position.x * scale, 85 + bike.position.z * scale); radar.rotate(-heading); radar.fillStyle = '#e5e3b4'; radar.beginPath(); radar.moveTo(0, -5); radar.lineTo(-4, 4); radar.lineTo(4, 4); radar.fill(); radar.restore();
}
let last = performance.now(), accumulator = 0, fpsTime = 0, fpsFrames = 0;
renderer.setAnimationLoop(now => {
  const rawDt = (now - last) / 1000, dt = Math.min(rawDt, .1); last = now;
  const updateStart = performance.now();
  accumulator += dt;
  while (accumulator >= 1 / 60) { if (state.mode !== 'paused') update(1 / 60); accumulator -= 1 / 60; }
  if (state.mode === 'paused') sound.update({ speed: 0, boosting: false, mode: 'paused' }, dt);
  const updateMs = performance.now()-updateStart;
  if (state.mode !== 'paused') graphics.updateQuality(rawDt);
  const renderStart = performance.now();
  if (state.mode !== 'paused' || renderDirty) { graphics.render(); renderDirty=false; }
  state.performance = { updateMs: Math.round(updateMs*10)/10, renderMs: Math.round((performance.now()-renderStart)*10)/10, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
 state.frames++; state.ready = true; $('loading').hidden = true;
  fpsTime += rawDt; fpsFrames++; if (fpsTime > 1) { state.fps = Math.round(fpsFrames / fpsTime); fpsTime = 0; fpsFrames = 0; }
});
addEventListener('resize', () => { renderDirty=true; graphics.resize(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
