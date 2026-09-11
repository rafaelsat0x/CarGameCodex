import * as THREE from 'three';
import { CONFIG } from '../config';
import { Player } from '../entities/Player';
import { Obstacle } from '../entities/Obstacle';
import { Coins } from '../entities/Coin';
import { Road } from '../world/Road';
import { Environment } from '../world/Environment';
import { Input } from './Input';
import { Rng } from './Rng';
import { AudioManager } from './AudioManager';
import { ObjectPool } from '../utils/ObjectPool';
import { clamp, damp, lerp } from '../utils/math';
import { Difficulty } from '../systems/Difficulty';
import { Spawner, type Row } from '../systems/Spawner';
import { Collision } from '../systems/Collision';
import { Score } from '../systems/Score';
import { Particles } from '../systems/Particles';
import { HUD } from '../ui/HUD';
import { Screens, type State } from '../ui/Screens';

export class Game {
  readonly scene = new THREE.Scene();
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fovMin, 1, CONFIG.camera.near, CONFIG.camera.far);
  readonly player = new Player(this.scene);
  readonly road = new Road(this.scene);
  readonly score = new Score();
  readonly audio = new AudioManager();
  readonly hud = new HUD();
  readonly screens: Screens;
  readonly input: Input;
  readonly environment: Environment;
  readonly obstacles: ObjectPool<Obstacle>;
  readonly coins = new Coins(this.scene);
  readonly particles: Particles;
  readonly collision: Collision;
  readonly spawner: Spawner;
  readonly seed: number;
  readonly debug: boolean;
  state: State = 'BOOT';
  time = 0; speed: number = CONFIG.speed.base; godMode = false;
  private previous = 0; private accumulator = 0; private animationTime = 0; private stateTime = 0;
  private frameDistance = 0; private exhaustTime = 0; private coinStreak = 0; private lastCoinAt = -Infinity;
  private pausedFrom: State = 'PLAYING'; private nextRow?: Row; private speedOverride?: number;
  private cameraX = 0; private lookX = 0; private cameraBlend = 1; private debugTimer = 0; private fps = 60;
  private readonly lookTarget = new THREE.Vector3();
  private readonly abort = new AbortController();

  constructor(root: HTMLElement) {
    const params = new URLSearchParams(location.search), parsedSeed = Number(params.get('seed'));
    this.seed = params.has('seed') && Number.isFinite(parsedSeed) ? parsedSeed >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.debug = params.get('debug') === '1';
    this.environment = new Environment(this.scene, this.seed);
    this.obstacles = new ObjectPool(CONFIG.pools.obstacles, i => new Obstacle(this.scene, i, this.debug));
    this.particles = new Particles(this.scene, new Rng(this.seed ^ CONFIG.world.scenerySeedOffset));
    this.collision = new Collision(this.scene, this.debug); this.spawner = new Spawner(new Rng(this.seed));
    this.player.onSwitch = () => this.audio.switch(); this.player.onBump = () => this.audio.bump();
    this.screens = new Screens({ start: () => this.start(), resume: () => this.pause(), restart: () => this.restart(), home: () => this.home(), pause: () => this.pause(), mute: () => this.mute() });
    this.input = new Input(root, { move: d => this.move(d), start: () => this.start(), pause: () => this.pause(), mute: () => this.mute(), debug: key => this.debugKey(key), active: () => this.state === 'PLAYING' || this.state === 'COUNTDOWN' });
    root.appendChild(this.renderer.domElement);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.camera.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.screens.muted(this.audio.muted);
    window.addEventListener('resize', this.resize, { signal: this.abort.signal }); this.resize();
    this.setState('MENU'); this.updateCamera(0); this.renderer.setAnimationLoop(this.frame);
    if (this.debug) {
      // Explicit debug-only harness, never installed for a normal production run.
      Object.assign(window, { __SUNSET_DEBUG__: {
        game: this,
        advance: (seconds: number, render = true) => { for (let i = 0; i < Math.round(seconds / CONFIG.timing.fixedStep); i++) this.step(CONFIG.timing.fixedStep); if (render) this.renderFrame(seconds); },
      } });
    }
  }
  start(): void { this.audio.unlock(); if (this.state === 'MENU' || this.state === 'GAME_OVER') this.restart(); else if (this.state === 'PAUSED') this.pause(); }
  restart(): void { this.audio.unlock(); this.audio.click(); this.reset(); this.setState('COUNTDOWN'); this.screens.countdown('3'); }
  home(): void { this.reset(); this.setState('MENU'); }
  pause(): void {
    if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
      this.pausedFrom = this.state; this.state = 'PAUSED'; this.player.clearBuffer(); this.screens.show('PAUSED'); this.audio.engine(0, false);
    } else if (this.state === 'PAUSED') { this.audio.unlock(); this.state = this.pausedFrom; this.screens.show(this.state); this.previous = performance.now(); this.accumulator = 0; }
  }
  move(direction: number): void { if (this.state === 'PLAYING') this.player.move(direction, this.time); }
  private mute(): void { this.audio.toggle(); this.screens.muted(this.audio.muted); }
  private setState(state: State): void { this.state = state; this.stateTime = 0; this.screens.show(state); this.hud.show(state !== 'MENU' && state !== 'GAME_OVER'); }
  private reset(): void {
    this.obstacles.reset(obstacle => obstacle.release()); this.coins.reset(); this.particles.reset(); this.score.reset();
    this.player.reset(); this.road.reset(); this.environment.reset(); this.spawner.reset(); this.hud.reset();
    this.time = 0; this.animationTime = 0; this.speed = this.speedOverride ?? CONFIG.speed.base; this.stateTime = 0; this.frameDistance = 0;
    this.accumulator = 0; this.exhaustTime = 0; this.coinStreak = 0; this.lastCoinAt = -Infinity;
    this.nextRow = this.spawner.next(0, 0, this.speedOverride);
  }
  private readonly resize = (): void => {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.camera.pixelRatio)); this.renderer.setSize(innerWidth, innerHeight);
  };
  private readonly frame = (ms: number): void => {
    const realDt = (ms - (this.previous || ms)) / 1000; this.previous = ms;
    const dt = Math.min(realDt, CONFIG.timing.maxDt);
    if (realDt > 0) this.fps = damp(this.fps, 1 / realDt, 2, dt);
    this.accumulator += dt;
    while (this.accumulator + 1e-10 >= CONFIG.timing.fixedStep) { this.accumulator -= CONFIG.timing.fixedStep; this.step(CONFIG.timing.fixedStep); }
    this.renderFrame(dt);
  };
  private step(dt: number): void {
    if (this.state === 'PAUSED') return;
    this.animationTime += dt; this.stateTime += dt;
    if (this.state === 'MENU') { this.frameDistance += CONFIG.speed.attract * dt; this.player.update(dt, CONFIG.speed.attract, 0); return; }
    if (this.state === 'COUNTDOWN') {
      const remaining = 3 - Math.floor(this.stateTime / CONFIG.timing.countdownBeat); this.screens.countdown(String(Math.max(1, remaining)));
      if (remaining <= 0) { this.setState('PLAYING'); this.screens.go(true); this.audio.click(); }
      return;
    }
    if (this.state === 'GAME_OVER') { this.screens.animate(dt); return; }
    if (this.state === 'CRASHING') { this.crashStep(dt); return; }
    if (this.stateTime >= CONFIG.timing.goDuration) this.screens.go(false);
    const oldTime = this.time; this.time += dt;
    this.speed = this.speedOverride ?? Difficulty.speed(this.time);
    const distance = Difficulty.travel(oldTime, this.time, 0, this.speedOverride);
    this.frameDistance += distance; this.score.update(dt, distance); this.player.update(dt, this.speed, this.time);
    for (const obstacle of this.obstacles.items) if (obstacle.active) {
      obstacle.update(distance - obstacle.speed * dt, this.time);
      if (obstacle.group.position.z > CONFIG.spawn.recycleZ) obstacle.release();
    }
    this.coins.update(dt, distance);
    if (this.nextRow && this.time >= this.nextRow.spawnAt) {
      this.spawn(this.nextRow); this.nextRow = this.spawner.next(this.time, Difficulty.normalized(this.time), this.speedOverride);
    }
    this.collision.update(this.player);
    for (const obstacle of this.obstacles.items) if (obstacle.active) {
      obstacle.helper.visible = this.debug;
      if (!this.godMode && this.collision.hits(obstacle)) { this.crash(); break; }
      if (!obstacle.passed && obstacle.group.position.z >= 0) {
        obstacle.passed = true;
        if (this.collision.nearMiss(obstacle, this.player, this.time)) { const earned = this.score.reward('nearMiss'); this.hud.popup(`NEAR MISS! +${earned}`); this.audio.nearMiss(); }
      }
    }
    if (this.state !== 'PLAYING') return;
    for (const coin of this.coins.pool.items) if (coin.active && this.collision.collects(coin, this.player.group.position.x)) {
      coin.collected = true; coin.age = 0;
      const earned = this.score.reward('coin'); this.hud.popup(`+${earned}`);
      this.coinStreak = this.time - this.lastCoinAt < CONFIG.coins.streakWindow ? this.coinStreak + 1 : 0;
      this.lastCoinAt = this.time; this.audio.coin(this.coinStreak); this.particles.burst(coin.x, CONFIG.coins.height, coin.z, 'coin');
    }
    this.exhaustTime += dt;
    if (this.exhaustTime >= CONFIG.particles.exhaustInterval) { this.exhaustTime = 0; this.particles.burst(this.player.group.position.x, CONFIG.car.wheelRadius, CONFIG.car.length / 2, 'exhaust'); }
  }
  private spawn(row: Row): void {
    const travel = Difficulty.travel(row.spawnAt, this.time, row.speed, this.speedOverride);
    for (let lane = 0; lane < CONFIG.lanes.count; lane++) {
      if (!(row.blocked & (1 << lane)) || (row.type === 'changer' && lane !== row.changeFrom)) continue;
      this.obstacles.acquire()?.spawn(row, lane, this.time, travel);
    }
    this.coins.spawn(row, travel);
  }
  private crash(): void {
    this.setState('CRASHING'); this.player.clearBuffer(); this.audio.crash(); this.audio.engine(0, false);
    this.particles.burst(this.player.group.position.x, CONFIG.car.bodyY, 0, 'crash');
  }
  private crashStep(dt: number): void {
    const amount = Math.max(0, 1 - this.stateTime / CONFIG.timing.crashSlow);
    const distance = this.speed * amount * dt; this.frameDistance += distance;
    for (const obstacle of this.obstacles.items) if (obstacle.active) obstacle.update(distance, this.time);
    this.coins.update(dt, distance);
    this.player.group.rotation.y += CONFIG.timing.crashSpin * dt * Math.max(amount, 0.1);
    this.player.group.rotation.z = Math.sin(this.stateTime * Math.PI) * CONFIG.lanes.roll * 3;
    this.player.group.position.y = Math.sin(Math.min(1, this.stateTime / CONFIG.timing.crashDuration) * Math.PI) * CONFIG.timing.crashLift;
    if (this.stateTime >= CONFIG.timing.crashDuration) { this.screens.results(this.score); this.setState('GAME_OVER'); }
  }
  private renderFrame(dt: number): void {
    this.road.update(this.frameDistance); this.environment.update(this.frameDistance);
    if (this.state !== 'PAUSED') { this.particles.update(dt, this.frameDistance); this.coins.render(this.animationTime); this.updateCamera(dt); }
    this.frameDistance = 0;
    this.hud.update(this.state === 'PAUSED' ? 0 : dt, this.score, this.speed);
    this.audio.engine(this.speed, this.state === 'PLAYING');
    this.renderer.render(this.scene, this.camera);
    if (this.debug) {
      this.debugTimer -= dt;
      if (this.debugTimer <= 0) {
        this.debugTimer = CONFIG.timing.hudInterval;
        this.hud.debugText(`${this.fps.toFixed(0)} FPS · ${this.renderer.info.render.calls} draws\n${this.state} · ${this.speed.toFixed(1)} m/s · d=${Difficulty.normalized(this.time).toFixed(2)}\nObstacles ${this.obstacles.count}/${CONFIG.pools.obstacles} · Coins ${this.coins.pool.count}/${CONFIG.pools.coins}\nParticles ${this.particles.count} · seed ${this.seed}\nG god ${this.godMode ? 'ON' : 'off'} · +/- speed · N next pattern`);
      }
    }
  }
  private updateCamera(dt: number): void {
    const c = CONFIG.camera;
    this.cameraBlend = damp(this.cameraBlend, this.state === 'MENU' ? 1 : 0, c.lookDamping, dt);
    this.cameraX = damp(this.cameraX, this.player.group.position.x, c.followDamping, dt);
    this.lookX = damp(this.lookX, this.player.group.position.x, c.lookDamping, dt);
    const fast = clamp((this.speed - CONFIG.speed.base) / (CONFIG.speed.max - CONFIG.speed.base), 0, 1);
    const shake = this.state === 'CRASHING' ? c.crashShake * Math.max(0, 1 - this.stateTime / CONFIG.timing.crashDuration) : this.state === 'PLAYING' ? c.speedShake * fast ** 3 : 0;
    this.camera.position.set(lerp(this.cameraX, innerWidth < innerHeight ? c.mobileMenuX : c.menuX, this.cameraBlend) + Math.sin(this.animationTime * c.shakeHz) * shake,
      lerp(c.offset[1], c.menuY, this.cameraBlend) + Math.cos(this.animationTime * c.shakeHz * c.verticalShakeRate) * shake,
      lerp(c.offset[2], c.menuZ, this.cameraBlend));
    this.lookTarget.set(lerp(this.lookX * c.lookFollowFactor, c.menuTargetX, this.cameraBlend), c.target[1], lerp(c.target[2], c.menuTargetZ, this.cameraBlend)); this.camera.lookAt(this.lookTarget);
    const targetFov = lerp(c.fovMin, c.fovMax, fast) + (innerWidth < innerHeight ? c.portraitFovBonus : 0);
    const nextFov = damp(this.camera.fov, targetFov, c.lookDamping, dt);
    if (Math.abs(this.camera.fov - nextFov) > 0.001) { this.camera.fov = nextFov; this.camera.updateProjectionMatrix(); }
  }
  private debugKey(key: string): void {
    if (!this.debug) return;
    if (key.toLowerCase() === 'g') this.godMode = !this.godMode;
    if (key === '+' || key === '=' || key === '-') {
      this.speedOverride = clamp((this.speedOverride ?? this.speed) + (key === '-' ? -1 : 1) * CONFIG.input.debugSpeedStep, CONFIG.speed.base, CONFIG.speed.max);
      this.replan();
    }
    if (key.toLowerCase() === 'n') this.replan();
  }
  private replan(): void {
    // Manual speed discontinuities invalidate predictions: clear and replan safely.
    this.obstacles.reset(obstacle => obstacle.release()); this.coins.reset(); this.spawner.reset();
    this.nextRow = this.spawner.next(this.time, Difficulty.normalized(this.time), this.speedOverride);
    this.hud.popup('FRESH STRETCH OF ROAD');
  }
  dispose(): void {
    this.renderer.setAnimationLoop(null); this.abort.abort(); this.input.dispose(); this.screens.dispose(); this.audio.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        geometries.add(object.geometry);
        if (Array.isArray(object.material)) for (const material of object.material) materials.add(material); else materials.add(object.material);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
    if (this.debug) Reflect.deleteProperty(window, '__SUNSET_DEBUG__');
  }
}
