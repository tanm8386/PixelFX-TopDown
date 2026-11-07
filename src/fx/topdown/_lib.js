// Shared by the top-down 3/4 effects: a small particle system in world space (x right, z towards the viewer,
// h up) that projects through the painter's camera. Files starting with _ are helpers, not effects.

import { Rng, TAU, WHITE, hex, mix, scale, FIRE_RAMP, SMOKE_RAMP } from "../../core/index.js";

/** Particle kinds for TopParticles. */
export const K = { SPARK: 0, MOTE: 1, FLAKE: 2, VAPOUR: 3, DUST: 4, STAR: 5, EMBER: 6, FIRE: 7, SMOKE: 8, GRIT: 9, SHARD: 10, DRIP: 11 };
/** Flags: SMOKES (a FIRE puff leaves smoke), BIG (bigger, slower smoke), BACK (draw behind). */
export const F = { SMOKES: 1, BIG: 2, BACK: 4 };

const CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const GRAVITY = 950;

/**
 * Particles in a top-down world. spawn(kind, x, z, h, vx, vz, vh, life, color, size, delay, flag): x right,
 * z towards the viewer, h height above the ground, vh up. update(dt); draw(p, layer): "back" draws the far
 * half (z < 0), "front" the near half, nothing draws all of it sorted far to near.
 */
export class TopParticles {
  constructor(opts = {}) {
    this.R = opts.rng ?? new Rng(opts.seed ?? 1);
    this.list = [];
    this.t = 0;
    this.sparks = (opts.sparks ?? ["#ffffff", "#e8fbff", "#8fe8ff", "#4aa8d8"]).map(hex);
    this.fire = (opts.fire ?? FIRE_RAMP).map(hex);
    this.maxH = opts.maxH ?? Infinity;
    this.haze = opts.haze === undefined ? null : hex(opts.haze);
  }

  spawn(k, x, z, h, vx, vz, vh, life, col = WHITE, size = 1, delay = 0, flag = 0) {
    this.list.push({
      k, x, z, h, vx, vz, vh, life, max: life, col: col ? hex(col) : 0, size, delay, flag,
      seed: this.R.next() * 100, a: k === K.SHARD ? this.R.range(0, TAU) : 0, va: k === K.SHARD ? this.R.range(-18, 18) : 0,
    });
  }

  get count() { return this.list.length; }

  update(dt) {
    this.t += dt;
    const R = this.R, t = this.t;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      if (q.delay > 0) { q.delay -= dt; continue; }
      if ((q.life -= dt) <= 0) {
        if (q.k === K.FIRE && q.flag & F.SMOKES) {
          const big = q.flag & F.BIG;
          this.spawn(K.SMOKE, q.x, q.z, q.h, q.vx * 0.6, q.vz * 0.6, q.vh * 0.6 + 8, big ? R.range(1.3, 2.3) : R.range(0.8, 1.4), 0, q.size * (big ? 0.85 : 0.7), 0, big ? F.BIG : 0);
        }
        this.list.splice(i, 1);
        continue;
      }
      switch (q.k) {
        case K.SPARK:
          q.vh -= GRAVITY * 0.45 * dt;
          q.vx -= q.vx * 2.2 * dt; q.vz -= q.vz * 2.2 * dt; q.vh -= q.vh * 2.2 * dt;
          break;
        case K.GRIT:
        case K.SHARD:
          q.vh -= GRAVITY * 0.8 * dt;
          q.vx -= q.vx * 0.8 * dt; q.vz -= q.vz * 0.8 * dt;
          q.a += q.va * dt;
          break;
        case K.DRIP: q.vh -= GRAVITY * dt; break;
        case K.FLAKE:
          q.vh -= 28 * dt;
          q.vx -= q.vx * 1.4 * dt; q.vz -= q.vz * 1.4 * dt;
          q.vx += Math.sin(t * 2.5 + q.seed) * 7 * dt;
          break;
        case K.FIRE:
          q.vh += 95 * dt;
          q.vx += Math.sin(t * 17 + q.seed) * 30 * dt;
          q.vx -= q.vx * 5 * dt; q.vz -= q.vz * 5 * dt; q.vh -= q.vh * 3.2 * dt;
          break;
        case K.SMOKE:
          q.vh += 16 * dt;
          q.vx += Math.sin(t * 1.3 + q.seed) * 8 * dt;
          q.vx -= q.vx * 1.6 * dt; q.vz -= q.vz * 1.6 * dt; q.vh -= q.vh * 1.2 * dt;
          break;
        case K.VAPOUR:
        case K.DUST:
          q.vh += 5 * dt;
          q.vx -= q.vx * 3 * dt; q.vz -= q.vz * 3 * dt; q.vh -= q.vh * 3 * dt;
          break;
        case K.EMBER:
          q.vh += (-30 + Math.sin(t * 3 + q.seed) * 20) * dt;
          q.vx += Math.cos(t * 2.3 + q.seed) * 45 * dt;
          q.vx -= q.vx * 1.6 * dt; q.vz -= q.vz * 1.6 * dt; q.vh -= q.vh * 1.6 * dt;
          break;
        case K.STAR: break;
        default:
          q.vx -= q.vx * 1.6 * dt; q.vz -= q.vz * 1.6 * dt; q.vh -= q.vh * 1.6 * dt;
      }
      q.x += q.vx * dt; q.z += q.vz * dt; q.h += q.vh * dt;
      if (q.h > this.maxH) { q.h = this.maxH; if (q.vh > 0) q.vh = 0; }
      if (q.h <= 0 && q.vh < 0 && (q.k === K.SPARK || q.k === K.GRIT || q.k === K.SHARD || q.k === K.DRIP || q.k === K.FLAKE)) {
        if (q.k === K.DRIP) { q.life = 0; continue; }
        if (q.k === K.FLAKE) { q.h = 0; q.vh = 0; q.life = Math.min(q.life, 0.25); continue; }
        const bounce = q.k === K.SPARK ? 0.45 : 0.3;
        if (Math.abs(q.vh) > 70) { q.vh = -q.vh * bounce; q.vx *= 0.7; q.vz *= 0.7; q.h = 0.01; }
        else { q.h = 0; q.vh = 0; q.vx *= 0.6; q.vz *= 0.6; q.life = Math.min(q.life, 0.35); }
      }
    }
  }

  draw(p, layer) {
    const list = this.list
      .filter((q) => q.delay <= 0 && (layer === undefined || (layer === "back" ? q.z < 0 : q.z >= 0)))
      .sort((a, b) => a.z - b.z);
    for (const q of list) {
      const k = q.life / q.max;
      const [x, y] = p.at(q.x, q.z, q.h);
      const [vx, vy] = p.vel(q.vx, q.vh, q.vz);
      const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
      switch (q.k) {
        case K.SPARK: {
          const S = this.sparks, head = k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2], len = Math.min(9, 1 + sp * 0.022);
          p.line(x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? head : S[S.length - 1]);
          p.line(x - ux * len * 0.45, y - uy * len * 0.45, x, y, head);
          p.glow(x, y, 3, head, 0.45 * k);
          break;
        }
        case K.FLAKE: {
          const a = Math.min(1, k * 3);
          p.dot(x, y, q.col, a);
          if (q.size > 1.3) for (const [dx, dy] of CROSS) p.dot(x + dx, y + dy, scale(q.col, 0.8), a * 0.8);
          break;
        }
        case K.VAPOUR: {
          const r = q.size * (0.6 + (1 - k) * 0.9);
          p.disc(x, y, r, q.col, Math.pow(k, 1.3) * 0.45);
          if (this.haze) p.glow(x, y, r * 1.8, this.haze, 0.16 * k);
          break;
        }
        case K.DUST: p.disc(x, y, q.size * (0.6 + (1 - k) * 0.9), q.col, Math.pow(k, 1.3) * 0.7); break;
        case K.SMOKE: {
          const age = 1 - k, big = q.flag & F.BIG;
          const r = q.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * (big ? 0.5 : 0.4));
          const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * (big ? 0.7 : 0.58);
          const c = q.col ? mix(q.col, SMOKE_RAMP[Math.min(SMOKE_RAMP.length - 1, Math.floor(age * SMOKE_RAMP.length))], age) : SMOKE_RAMP[Math.min(SMOKE_RAMP.length - 1, Math.floor(age * 1.05 * SMOKE_RAMP.length))];
          p.disc(x, y, r, c, a * 0.45);
          p.disc(x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
          if (age < 0.5) p.disc(x - r * 0.22, y - r * 0.3, r * 0.5, mix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
          break;
        }
        case K.FIRE: {
          const age = 1 - k, heat = Math.min(0.999, Math.pow(age, 0.62) + (q.seed % 1) * 0.1), n = this.fire.length;
          const idx = Math.min(n - 2, Math.floor(heat * (n - 1)));
          const r = q.size * (0.55 + 0.45 * Math.min(1, age * 7)) * (1 - age * 0.55), c = this.fire[idx];
          if (idx >= n - 2) p.disc(x, y, r, c, Math.min(1, k * 3) * 0.85);
          else {
            p.circle(x, y, r, this.fire[Math.min(n - 1, idx + 2)]);
            p.circle(x - r * 0.16, y - r * 0.22, r * 0.78, c);
            if (r > 1.6) p.circle(x, y - r * 0.9, r * 0.42, c);
            if (idx <= 3 && r > 1.8) p.circle(x - r * 0.28, y - r * 0.34, r * 0.36, this.fire[Math.max(0, idx - 1)]);
            if (idx < 6) p.glow(x, y, r * 2.4 + 2, c, 0.18 * k);
          }
          break;
        }
        case K.EMBER: {
          const c = k > 0.6 ? this.sparks[0] : k > 0.3 ? this.sparks[1] : this.sparks[2];
          if (k < 0.25 && Math.sin(this.t * 40 + q.seed) < 0) break;
          p.px(x, y, c);
          if (q.size > 1.5) p.px(x, y + 1, this.sparks[this.sparks.length - 1]);
          p.glow(x, y, 3 + q.size, c, 0.35 * k);
          break;
        }
        case K.STAR: {
          const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + (q.seed % 5)) + q.seed);
          if (q.size < 1) {
            if (tw * k > 0.25) p.px(x, y, tw > 0.8 ? WHITE : q.col);
            p.glow(x, y, 3, q.col, 0.4 * k * tw);
          } else {
            const n = Math.round(q.size * tw * Math.min(1, k * 3));
            if (n >= 1) {
              for (let d = 1; d <= n; d++) for (const [dx, dy] of CROSS) p.px(Math.floor(x) + dx * d, Math.floor(y) + dy * d, d > n * 0.6 ? scale(q.col, 0.75) : q.col);
              p.px(Math.floor(x), Math.floor(y), WHITE);
              p.glow(x, y, 4 + n * 2, q.col, 0.5 * k * tw);
            }
          }
          break;
        }
        case K.GRIT:
          if (k > 0.25 || k * 4 > 0.5) {
            p.px(x, y, q.col);
            if (q.size >= 2) (p.px(x + 1, y, q.col), p.px(x, y + 1, scale(q.col, 0.8)), p.px(x + 1, y + 1, scale(q.col, 0.7)));
          }
          break;
        case K.SHARD: {
          const a = Math.min(1, k / 0.4), ca = Math.cos(q.a), sa = Math.sin(q.a);
          for (let d = -q.size / 2; d <= q.size / 2; d += 0.5) p.dot(x + ca * d, y + sa * d, d > q.size / 2 - 0.6 ? WHITE : q.col, a);
          break;
        }
        case K.DRIP: p.dot(x, y, q.col, Math.min(1, k / 0.4)); break;
        default: break;
      }
    }
  }
}

/** Sort world points far to near, so a set of billboards overlaps correctly. */
export const depthSort = (list) => [...list].sort((a, b) => a.z - b.z);

/** A point on a circle of radius r at angle a, in world (x, z). */
export const onCircle = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

/**
 * A flat ring on the ground drawn as radial dots: cheaper than shading its whole bounding box, and it keeps a
 * crisp pixel edge. w is the thickness inward; c may be a function of (v: 0 outer..1 inner, angle).
 */
export function ringDots(p, r, w, c, a = 1) {
  if (r <= 0 || a <= 0.01) return;
  const g = p.ground, n = Math.max(24, Math.ceil(r * TAU / 1.15)), steps = Math.max(1, Math.round(w));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let j = 0; j < steps; j++) {
      const v = j / steps, rr = r - v * w;
      p.dot(ca * rr, sa * rr * g, typeof c === "function" ? c(v, ang) : c, a * (1 - v * 0.55));
    }
  }
}
