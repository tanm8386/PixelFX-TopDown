import { Rng, clamp, smooth, ease, rand, TAU, WHITE, fit, crystal } from "../../core/index.js";
import { TopParticles, K, ringDots } from "./_lib.js";

export const meta = {
  name: "Glacial bloom",
  desc: "A top-down frost nova: cold gathers into a spinning snowflake, then a rime wave races across the floor and rings of ice crystals erupt; snow drifts down and the ice melts.",
  tags: ["topdown", "ice", "frost", "nova", "aoe", "magic", "one-shot"],
  size: [288, 208],
  origin: [144, 122],
  duration: 3.8,
  loop: false,
  fps: 30,
  bg: "topdown",
  view: "topdown",
  options: {
    palette: ["#0d1230", "#161d4a", "#22336f", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#ffffff"],
    reach: 86,
    seed: 7,
  },
};

// The cold gathers, breaks outward, stands, then melts. Times in seconds.
const CHARGE = 0.46, SPREAD = 0.72, HOLD = 2.0, MELT = 0.8, CORE_H = 26;
// three rings of crystals: tall ones close in, small ones out at the rim
const RINGS = [
  { q: 0.3, n: 3, h: [26, 38], w: [11, 15] },
  { q: 0.58, n: 5, h: [16, 24], w: [8, 11] },
  { q: 0.86, n: 7, h: [9, 15], w: [5, 7] },
];

// a six-armed snowflake, drawn as a billboard in screen space
function snowflake(p, C, x, y, L, spin, k) {
  if (L < 0.8) return;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i * TAU) / 6, ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 0; d <= L; d += 0.5) p.dot(x + ca * d, y + sa * d, d < L * 0.35 ? WHITE : C[6], Math.min(1, k + 0.2));
    if (L > 3)
      for (const s of [-1, 1]) {
        const bx = x + ca * L * 0.6, by = y + sa * L * 0.6, ba = a + s * 0.9;
        for (let d = 0; d <= L * 0.34; d += 0.5) p.dot(bx + Math.cos(ba) * d, by + Math.sin(ba) * d, C[5], k);
      }
  }
  p.px(x, y, WHITE);
  p.glow(x, y, 10 + L * 2.6, C[5], 0.3 + 0.45 * k);
}

export function create(o) {
  const C = fit(o.palette, 8);
  const ICE = [C[0], C[2], C[3], C[4], C[5], C[6], C[7], WHITE];
  const ICE_BACK = [C[0], C[1], C[2], C[3], C[4], C[5], C[6], C[6]];
  const REACH = o.reach, R = new Rng(o.seed);
  const ps = new TopParticles({ rng: R, sparks: [C[7], C[6], C[5], C[4]], haze: C[5] });

  // frost speckles, scattered once across the whole disc: sparse in the middle, thick at the rim
  const FR = new Rng(o.seed + 101), frost = [], clumps = [];
  for (let i = 0; i < 8000; i++) {
    const a = FR.range(0, TAU), rr = Math.sqrt(FR.next()) * (REACH + 2), n = FR.next();
    if (n > 0.1 + 0.3 * (rr / REACH)) continue;
    frost.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d: rr, n });
  }
  for (let i = 0; i < 60; i++) {
    const a = FR.range(0, TAU), rr = Math.sqrt(FR.next()) * REACH * 0.96;
    clumps.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d: rr, r: FR.range(3, 8), n: FR.next() });
  }

  // lay the crystals out around the caster: three rings, evenly spaced, jittered
  const sites = [];
  RINGS.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU + ri * 0.42 + R.range(-0.13, 0.13);
      const rr = REACH * (ring.q + R.range(-0.045, 0.045));
      const h = R.range(...ring.h), w = R.range(...ring.w);
      const kids = [];
      for (let k = 0, nk = ri < 2 ? R.int(0, 2) : 0; k < nk; k++) {
        const side = k % 2 ? -1 : 1, kh = h * R.range(0.32, 0.55);
        kids.push({
          dx: side * R.range(0.55, 0.95) * w, dz: R.range(-2.5, 2.5),
          h: kh, w: w * R.range(0.45, 0.65), lean: side * kh * R.range(0.25, 0.5),
        });
      }
      sites.push({
        x: Math.cos(a) * rr, z: Math.sin(a) * rr, h, w, kids,
        lean: (R.next() < 0.5 ? -1 : 1) * h * R.range(0.05, 0.16),
        t0: CHARGE + SPREAD * (1 - Math.cbrt(1 - clamp(rr / REACH))) + R.range(0, 0.05),
        phase: R.next(), up: false,
      });
    }
  });
  sites.sort((a, b) => a.z - b.z);

  const front = (t) => (t < CHARGE ? 0 : REACH * (1 - Math.pow(1 - clamp((t - CHARGE) / SPREAD), 3)));
  const sink = (t) => smooth(HOLD, HOLD + MELT, t);
  const out = (t) => 1 - smooth(HOLD + 0.15, HOLD + MELT + 0.7, t);
  let t = 0, released = false;

  const drawFrost = (p, fr, a) => {
    if (fr <= 0 || a <= 0.01) return;
    const g = p.ground, edge = fr + 2;
    // a low, broken crust under the speckles
    for (const c of clumps) {
      const reach = edge + (c.n - 0.5) * 10;
      if (c.d > reach) continue;
      p.groundDisc(c.x, c.z, c.r, c.n > 0.5 ? C[4] : C[3], 0.5 * clamp((reach - c.d) / 5.5) * a);
    }
    for (const f of frost) {
      const reach = edge + (f.n - 0.5) * 9;
      if (f.d > reach) continue;
      const k = clamp((reach - f.d) / 5.5) * a;
      if (k <= 0.02) continue;
      const fresh = reach - f.d < 4;
      const c = fresh || f.n > 0.95 ? WHITE : f.n > 0.8 ? C[6] : f.n > 0.42 ? C[5] : C[4];
      p.dot(f.x, f.z * g, c, k * (f.n < 0.1 ? 0.6 : 0.9));
      if (f.n > 0.9) p.dot(f.x + 1, f.z * g, C[6], k * 0.7);
      if (f.n < 0.07) {
        p.dot(f.x + 1, f.z * g, C[5], k * 0.7);
        p.dot(f.x, f.z * g - 1, C[4], k * 0.6);
      }
    }
  };

  // hairline cracks running out from the caster as the wave passes
  const drawCracks = (p, fr, a) => {
    if (fr < 6 || a <= 0.01) return;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + rand(i, 5) * 0.55, len = fr * (0.5 + rand(i, 6) * 0.48);
      const steps = Math.max(2, Math.ceil(len / 7));
      let px = 0, pz = 0;
      for (let j = 1; j <= steps; j++) {
        const r = (j / steps) * len, side = (rand(i, j, 7) - 0.5) * 4 * (j / steps);
        const x = Math.cos(ang) * r - Math.sin(ang) * side, z = Math.sin(ang) * r + Math.cos(ang) * side;
        p.groundLine(px, pz, x, z, j === steps ? C[6] : C[5], a * (0.3 + 0.6 * (j / steps)));
        px = x; pz = z;
      }
    }
  };

  const drawGround = (p) => {
    const o2 = out(t), fr = front(t);
    if (t < CHARGE) return;
    const u = clamp((t - CHARGE) / SPREAD);
    // the rime follows just behind the wave crest, then fills out to the rim
    drawFrost(p, fr - 6 * (1 - u), o2);
    drawCracks(p, fr, o2 * 0.65);
    if (u < 1) {
      const r = fr + 2, w = Math.max(1.5, 8 * Math.pow(1 - u, 0.7));
      // a dark edge under the wave, then the bright crest, so it reads against the rime
      ringDots(p, r + 1.2, 1.4, C[1], 0.55 * (1 - u));
      ringDots(p, r, w, (v) => (v < 0.22 ? WHITE : v < 0.55 ? C[6] : C[5]), 0.9 * (u < 0.72 ? 1 : (1 - u) / 0.28));
      if (r * 0.78 > 3) ringDots(p, r * 0.78, Math.max(1, w * 0.5), C[4], 0.4 * (1 - u));
      p.glow(0, 0, 24, C[5], 0.18 * (1 - u));
    } else {
      // a broken rim of settled frost marks the edge of the blast
      const n = 84;
      for (let i = 0; i < n; i++) {
        if (rand(i, 33) > 0.55) continue;
        const ang = (i / n) * TAU, rr = REACH * (0.94 + rand(i, 34) * 0.08);
        p.dot(Math.cos(ang) * rr, Math.sin(ang) * rr * p.ground, rand(i, 35) > 0.7 ? WHITE : C[5], 0.55 * o2);
      }
      p.glow(0, 0, 34, C[4], 0.12 * o2);
    }
  };

  const drawCrystals = (p, back) => {
    const m = sink(t);
    if (m >= 1) return;
    for (const s of sites) {
      if (!s.up || (s.z < 0) !== back) continue;
      const grow = ease.outBack(clamp((t - s.t0) / 0.12), 2.4), white = t < s.t0 + 0.035;
      const sw = (((t - s.t0) * 0.8 + s.phase * 1.7) % 1.7) / 0.5;
      const [sx, sy] = p.at(s.x, s.z, 0);
      p.groundDisc(s.x, s.z, s.w * 0.65 + 2, C[0], 0.5 * Math.min(1, grow) * (1 - m));
      p.glow(sx, sy - 3, s.w * 0.7 + 4, C[5], 0.18 * Math.min(1, grow) * (1 - m));
      for (const q of s.kids) {
        const [kx, ky] = p.at(s.x + q.dx, s.z + q.dz, 0);
        crystal(p, kx, ky, q.h * grow * (1 - m), q.w * (1 - m * 0.3), q.lean * grow * (1 - m), back ? ICE_BACK : ICE, { white });
      }
      crystal(p, sx, sy, s.h * grow * (1 - m), s.w * (1 - m * 0.3), s.lean * grow * (1 - m), back ? ICE_BACK : ICE, {
        white, glint: sw <= 1 ? sw : -1,
      });
    }
  };

  const drawCore = (p) => {
    if (t >= CHARGE + 0.24) return;
    const [cx, cy] = p.at(0, 0, CORE_H);
    if (t < CHARGE) {
      const k = t / CHARGE;
      const beat = 1 + 0.22 * Math.exp(-((t - CHARGE * 0.55) ** 2) / 0.002) + 0.28 * Math.exp(-((t - CHARGE * 0.85) ** 2) / 0.002);
      snowflake(p, C, cx, cy, (2 + 5.5 * k * k) * beat, t * 4, k);
    } else {
      // the snowflake bursts into a quick sphere of light
      const a = clamp((t - CHARGE) / 0.24), rr = 4 + 26 * ease.outCubic(a);
      p.ring(cx, cy, rr, Math.max(1, 3.5 * (1 - a)), C[6], 1 - a);
      p.circle(cx, cy, 3 + 5 * (1 - a), WHITE, 0.9 * (1 - a));
      p.glow(cx, cy, 24 + 22 * (1 - a), WHITE, 0.5 * (1 - a));
    }
  };

  return {
    update(dt) {
      t += dt;
      const fr = front(t);
      // the cold spirals in
      if (t < CHARGE - 0.02 && R.chance(0.9)) {
        const a = R.range(0, TAU), D = R.range(24, 56), h = R.range(2, 28);
        const x = Math.cos(a) * D, z = Math.sin(a) * D;
        const dx = -x, dz = -z, dh = CORE_H - h, l = Math.hypot(dx, dz, dh) || 1, sp = R.range(45, 85);
        ps.spawn(K.STAR, x, z, h, (dx / l) * sp, (dz / l) * sp, (dh / l) * sp, R.range(0.28, 0.42), R.chance(0.5) ? C[6] : C[5], R.range(0.6, 1.1));
      }
      if (t >= CHARGE && !released) {
        released = true;
        for (let i = 0; i < 26; i++) {
          const a = R.range(0, TAU), sp = R.range(55, 125);
          ps.spawn(K.SHARD, 0, 0, R.range(1, 10), Math.cos(a) * sp, Math.sin(a) * sp, R.range(55, 155), R.range(0.8, 1.3), R.pick([C[7], C[6], C[5]]), R.range(1.4, 3));
        }
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), sp = R.range(25, 85);
          ps.spawn(K.FLAKE, 0, 0, R.range(2, 18), Math.cos(a) * sp, Math.sin(a) * sp, R.range(5, 30), R.range(1.0, 1.6), R.chance(0.6) ? WHITE : C[6], R.range(0.5, 1.4));
        }
      }
      // the wave throws up mist and snow as it runs outward
      if (t > CHARGE && t < CHARGE + SPREAD && R.chance(0.75)) {
        const a = R.range(0, TAU), x = Math.cos(a) * fr, z = Math.sin(a) * fr;
        ps.spawn(K.VAPOUR, x, z, R.range(0, 4), Math.cos(a) * R.range(8, 30), Math.sin(a) * R.range(8, 30), R.range(2, 9), R.range(0.5, 0.85), R.chance(0.7) ? C[6] : C[5], R.range(2, 3.6));
        if (R.chance(0.4)) ps.spawn(K.FLAKE, x, z, R.range(2, 10), Math.cos(a) * R.range(6, 24), Math.sin(a) * R.range(6, 24), R.range(8, 30), R.range(0.9, 1.5), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.1));
      }
      // each crystal punches up with a spray of shards and a puff
      for (const s of sites) {
        if (s.up || t < s.t0) continue;
        s.up = true;
        for (let i = 0; i < 2 + Math.round(s.h / 12); i++) {
          const a = R.range(0, TAU), sp = R.range(18, 50);
          ps.spawn(K.SHARD, s.x, s.z, R.range(0, 3), Math.cos(a) * sp, Math.sin(a) * sp, R.range(45, 115), R.range(0.5, 0.9), R.pick([C[7], C[6], C[5]]), R.range(1.2, 2.4));
        }
        ps.spawn(K.VAPOUR, s.x, s.z, R.range(0, 2), R.range(-12, 12), R.range(-12, 12), R.range(4, 14), R.range(0.45, 0.75), C[6], R.range(2.2, 3.8));
        if (s.h > 14) ps.spawn(K.STAR, s.x, s.z, R.range(3, s.h * 0.8), 0, 0, R.range(1, 5), R.range(0.3, 0.55), C[6], R.range(0.8, 2));
      }
      // while the ice stands: glints on the crystals and slow snow
      if (t > CHARGE + 0.25 && t < HOLD + 0.1) {
        if (R.chance(0.4)) {
          const s = R.pick(sites);
          if (s.up) ps.spawn(K.STAR, s.x, s.z, R.range(2, s.h * 0.9), 0, 0, R.range(1, 4), R.range(0.3, 0.55), R.chance(0.6) ? C[6] : WHITE, R.range(0.7, 1.8));
        }
        if (t < HOLD - 0.2 && R.chance(0.28)) {
          const a = R.range(0, TAU), rr = R.range(0, 1) * REACH * 0.95;
          ps.spawn(K.FLAKE, Math.cos(a) * rr, Math.sin(a) * rr, R.range(30, 56), R.range(-4, 4), R.range(-4, 4), R.range(-9, -3), R.range(1.1, 1.5), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.3));
        }
      }
      // melting: vapour lifts off the floor and the frost thins
      if (t > HOLD && t < HOLD + MELT && R.chance(0.4)) {
        const a = R.range(0, TAU), rr = R.range(0, 1) * REACH * 0.85;
        ps.spawn(K.VAPOUR, Math.cos(a) * rr, Math.sin(a) * rr, R.range(0, 3), R.range(-8, 8), R.range(-8, 8), R.range(5, 16), R.range(0.5, 0.75), C[5], R.range(2.5, 4.5));
      }
      ps.update(dt);
    },
    drawBack(p) {
      if (t >= meta.duration - 1e-4) return;
      drawGround(p);
      drawCrystals(p, true);
      drawCore(p);
      ps.draw(p, "back");
    },
    draw(p) {
      if (t >= meta.duration - 1e-4) return;
      drawCrystals(p, false);
      ps.draw(p, "front");
    },
  };
}
