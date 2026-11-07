import { Rng, clamp, smooth, ease, rand, TAU, WHITE, fit } from "../../core/index.js";
import { TopParticles, K, F, ringDots } from "./_lib.js";

export const meta = {
  name: "Meteor impact",
  desc: "A top-down meteor: a burning rock falls out of the sky trailing fire and smoke, slams into the floor in a ring of flame and dust, and leaves a glowing crater.",
  tags: ["topdown", "fire", "meteor", "impact", "aoe", "magic", "one-shot"],
  size: [288, 208],
  origin: [144, 122],
  duration: 3.6,
  loop: false,
  fps: 30,
  bg: "topdown",
  view: "topdown",
  options: {
    palette: ["#1a0a08", "#3a1410", "#6e1d14", "#a82a18", "#e0481c", "#ff7a22", "#ffc23d", "#fff3a6"],
    reach: 96,
    seed: 5,
  },
};

const FALL0 = 0.12, HIT = 1.08, START = { x: -26, z: 26, h: 96 };

export function create(o) {
  const C = fit(o.palette, 8), FIRE = [...C].reverse();
  const REACH = o.reach, R = new Rng(o.seed);
  const ps = new TopParticles({ rng: R, sparks: [C[7], C[6], C[5], C[4]], fire: FIRE, haze: C[5], maxH: 114 });

  // the scorched ground and the embers still glowing in the pit
  const CR = new Rng(o.seed + 202), scorch = [], coals = [];
  for (let i = 0; i < 180; i++) {
    const a = CR.range(0, TAU), rr = Math.sqrt(CR.next()) * 39;
    scorch.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d: rr, n: CR.next() });
  }
  for (let i = 0; i < 46; i++) {
    const a = CR.range(0, TAU), rr = 2 + Math.sqrt(CR.next()) * 27;
    coals.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, n: CR.next() });
  }

  const fall = (t) => {
    const u = clamp((t - FALL0) / (HIT - FALL0)), e = u * u;
    return { u, x: START.x * (1 - u), z: START.z * (1 - u), h: START.h * (1 - e) };
  };
  const craterOut = (t) => 1 - smooth(2.7, 3.45, t);
  let t = 0, impacted = false, popped = 0;

  const drawCrater = (p) => {
    if (t < HIT) return;
    const o2 = craterOut(t);
    if (o2 <= 0.01) return;
    for (const s of scorch) {
      const q = s.d / 39;
      if (s.n > 0.92 - q * 0.45) continue;
      p.dot(s.x, s.z * p.ground, s.n < 0.22 ? C[1] : C[0], 0.85 * o2);
    }
    ringDots(p, 36, 4, (v) => (v < 0.35 ? C[1] : C[0]), 0.75 * o2);
    // glowing cracks and coals, breathing
    const pulse = 0.72 + 0.28 * Math.sin(t * 8.5);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU + rand(i, 41) * 0.5, len = 10 + rand(i, 42) * 26, steps = Math.ceil(len / 6);
      let px = 0, pz = 0;
      for (let j = 1; j <= steps; j++) {
        const r = (j / steps) * len, side = (rand(i, j, 43) - 0.5) * 5 * (j / steps);
        const x = Math.cos(ang) * r - Math.sin(ang) * side, z = Math.sin(ang) * r + Math.cos(ang) * side;
        p.groundLine(px, pz, x, z, j === steps ? C[5] : C[4], o2 * pulse * (0.35 + 0.6 * (j / steps)));
        px = x; pz = z;
      }
    }
    for (const c of coals) p.dot(c.x, c.z * p.ground, c.n > 0.55 ? C[5] : C[4], o2 * pulse * 0.85);
    p.glow(0, 0, 34, C[4], 0.28 * o2 * pulse);
  };

  const drawWave = (p) => {
    if (t < HIT) return;
    const u = clamp((t - HIT) / 0.55);
    if (u >= 1) return;
    const r = REACH * ease.outCubic(u), w = Math.max(2, 9 * Math.pow(1 - u, 0.7));
    ringDots(p, r + 1.5, 1.5, C[1], 0.5 * (1 - u));
    ringDots(p, r, w, (v) => (v < 0.22 ? C[7] : v < 0.55 ? C[6] : C[5]), 0.95 * (1 - u * 0.4));
    if (r > 12) ringDots(p, r * 0.8, Math.max(1, w * 0.5), C[3], 0.45 * (1 - u));
    p.glow(0, 0, 30, C[5], 0.2 * (1 - u));
  };

  const drawMeteor = (p) => {
    if (t < FALL0 || t >= HIT) return;
    const m = fall(t);
    const [sx, sy] = p.at(m.x, m.z, m.h);
    // trail of fire blobs back along the fall path
    for (let i = 0; i < 9; i++) {
      const q = i / 9, mm = fall(Math.max(FALL0, t - q * 0.16)), [ax, ay] = p.at(mm.x, mm.z, mm.h);
      const r = 5.5 * (1 - q * 0.62);
      p.circle(ax, ay, r, q < 0.25 ? C[6] : q < 0.55 ? C[5] : C[4]);
      if (q < 0.5) p.glow(ax, ay, 12 + r * 2, C[5], 0.25 * (1 - q * 2));
    }
    p.glow(sx, sy, 22, C[5], 0.6);
    // the rock itself: a dark, cracked lump with a hot rim
    p.circle(sx + 1, sy + 1, 4.5, C[3]);
    p.circle(sx, sy, 3.8, C[1]);
    p.circle(sx - 1, sy - 1, 2.6, C[0]);
    p.dot(sx - 2, sy - 2, C[6]);
    p.dot(sx + 1, sy - 2, C[5]);
    p.dot(sx - 1, sy + 2, C[4]);
    p.dot(sx + 3, sy, C[4]);
  };

  const drawFlash = (p) => {
    if (t < HIT || t >= HIT + 0.26) return;
    const a = (t - HIT) / 0.26;
    p.circle(0, 0, 7 + 16 * (1 - a), WHITE, 0.85 * (1 - a));
    p.glow(0, 0, 12 + 58 * (1 - a), WHITE, 0.65 * (1 - a));
    p.glow(0, 0, 16 + 96 * (1 - a), C[5], 0.3 * (1 - a));
  };

  const pop = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const a = R.range(0, TAU), sp = R.range(20, 65);
      ps.spawn(K.FIRE, x, z, R.range(1, 8), Math.cos(a) * sp, Math.sin(a) * sp, R.range(30, 90), R.range(0.45, 0.8), C[5], R.range(1.6, 3), 0, F.SMOKES);
    }
    for (let i = 0; i < 4; i++) {
      const a = R.range(0, TAU), sp = R.range(20, 55);
      ps.spawn(K.SHARD, x, z, R.range(1, 5), Math.cos(a) * sp, Math.sin(a) * sp, R.range(30, 80), R.range(0.5, 0.9), R.pick([C[7], C[6], C[5]]), R.range(1.2, 2.2));
    }
  };

  return {
    update(dt) {
      t += dt;
      if (t > FALL0 && t < HIT) {
        const m = fall(t);
        if (R.chance(0.7)) ps.spawn(K.FIRE, m.x + R.range(-2, 2), m.z + R.range(-2, 2), m.h + R.range(-3, 2), R.range(-8, 8), R.range(-8, 8), R.range(8, 26), R.range(0.32, 0.6), C[5], R.range(1.4, 2.8), 0, F.SMOKES);
        if (R.chance(0.22)) ps.spawn(K.SMOKE, m.x, m.z, m.h, R.range(-6, 6), R.range(-6, 6), R.range(8, 22), R.range(0.6, 1.0), 0, R.range(1.2, 2.1));
        if (R.chance(0.3)) ps.spawn(K.EMBER, m.x + R.range(-2, 2), m.z + R.range(-2, 2), m.h, R.range(-25, 25), R.range(-25, 25), R.range(5, 30), R.range(0.4, 0.8), C[6], R.range(0.6, 1.2));
      }
      if (t >= HIT && !impacted) {
        impacted = true;
        for (let i = 0; i < 46; i++) {
          const a = R.range(0, TAU), sp = R.range(18, 68);
          ps.spawn(K.FIRE, R.range(-9, 9), R.range(-9, 9), R.range(2, 16), Math.cos(a) * sp, Math.sin(a) * sp, R.range(40, 135), R.range(0.55, 1.15), C[5], R.range(1.8, 4.4), 0, F.SMOKES);
        }
        for (let i = 0; i < 26; i++) {
          const a = R.range(0, TAU), sp = R.range(40, 110);
          ps.spawn(K.SHARD, 0, 0, R.range(1, 8), Math.cos(a) * sp, Math.sin(a) * sp, R.range(40, 120), R.range(0.7, 1.2), R.pick([C[7], C[6], C[5], C[4]]), R.range(1.2, 2.6));
        }
        for (let i = 0; i < 32; i++) {
          const a = R.range(0, TAU), sp = R.range(25, 90);
          ps.spawn(K.EMBER, 0, 0, R.range(1, 8), Math.cos(a) * sp, Math.sin(a) * sp, R.range(20, 85), R.range(0.6, 1.2), C[6], R.range(0.5, 1.2));
        }
        for (let i = 0; i < 20; i++) {
          const a = R.range(0, TAU), sp = R.range(20, 60);
          ps.spawn(K.GRIT, 0, 0, R.range(1, 5), Math.cos(a) * sp, Math.sin(a) * sp, R.range(30, 85), R.range(0.5, 0.9), R.chance(0.5) ? C[3] : C[2], R.range(1, 2));
        }
        for (let i = 0; i < 12; i++)
          ps.spawn(K.SMOKE, R.range(-8, 8), R.range(-8, 8), R.range(4, 14), R.range(-6, 6), R.range(-6, 6), R.range(15, 38), R.range(0.9, 1.5), 0, R.range(1.8, 3.2), 0, F.BIG);
      }
      if (t > HIT + 0.32 && popped === 0) { popped = 1; pop(R.range(-18, 18), R.range(-18, 18), 8); }
      if (t > HIT + 0.72 && popped === 1) { popped = 2; pop(R.range(-22, 22), R.range(-22, 22), 7); }
      // the crater keeps burning
      if (t > HIT && t < HIT + 1.25 && R.chance(0.55)) {
        const a = R.range(0, TAU), rr = Math.sqrt(R.next()) * 24;
        ps.spawn(K.FIRE, Math.cos(a) * rr, Math.sin(a) * rr, R.range(0, 4), R.range(-10, 10), R.range(-10, 10), R.range(20, 65), R.range(0.35, 0.7), C[5], R.range(1.4, 2.8), 0, F.SMOKES);
      }
      if (t > HIT && t < HIT + 1.7 && R.chance(0.24)) {
        const a = R.range(0, TAU), rr = Math.sqrt(R.next()) * 16;
        ps.spawn(K.SMOKE, Math.cos(a) * rr, Math.sin(a) * rr, R.range(3, 10), R.range(-4, 4), R.range(-4, 4), R.range(14, 32), R.range(0.9, 1.5), 0, R.range(2, 3.6), 0, F.BIG);
      }
      if (t > HIT && t < HIT + 1.4 && R.chance(0.3)) {
        const a = R.range(0, TAU), rr = Math.sqrt(R.next()) * 26;
        ps.spawn(K.EMBER, Math.cos(a) * rr, Math.sin(a) * rr, R.range(1, 6), R.range(-10, 10), R.range(-10, 10), R.range(10, 55), R.range(0.5, 1.0), C[6], R.range(0.5, 1.1));
      }
      ps.update(dt);
    },
    drawBack(p) {
      if (t >= meta.duration - 1e-4) return;
      if (t < HIT) {
        // the falling rock's shadow on the floor
        const m = fall(t);
        p.groundDisc(m.x, m.z, 5 + (1 - m.u) * 4, C[0], 0.35);
        p.glow(m.x, m.z * p.ground, 14 + (1 - m.u) * 10, C[4], 0.14 * (1 - m.u));
      }
      drawCrater(p);
      drawWave(p);
      ps.draw(p, "back");
    },
    draw(p) {
      if (t >= meta.duration - 1e-4) return;
      drawMeteor(p);
      drawFlash(p);
      ps.draw(p, "front");
    },
  };
}
