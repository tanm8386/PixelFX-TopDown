// A camera for top-down 3/4 effects.
//
// Effects are drawn in a local world where x is right, y is up (height above the ground) and z is towards
// the viewer (depth). The painter still draws in screen pixels (x right, y down), so a camera maps a world
// point to local screen coordinates:
//
//   screen.x = x
//   screen.y = z * ground - y
//
// `ground` is how much a step away from the viewer moves down the screen: 0 is a flat side view, 1 is a
// straight top-down view, and about 0.55-0.65 reads as the usual 3/4 RPG camera. Height is never squashed:
// characters, flames and crystals are billboards standing on the ground.

export class Camera {
  /**
   * opts.pitch: elevation above the ground plane, radians (0 side-on, PI/2 straight down).
   * opts.ground: the depth squash, if you want to set it directly (overrides pitch).
   */
  constructor(opts = {}) {
    this.pitch = opts.pitch ?? 0;
    this.ground = opts.ground ?? Math.sin(this.pitch);
    this.scale = opts.scale ?? 1;
  }

  /** World (x right, y up, z towards the viewer) -> local screen (x right, y down). */
  project(x, y, z) {
    const s = this.scale;
    return [x * s, (z * this.ground - y) * s];
  }

  /** A world velocity in the same axes -> the screen velocity a streak should use. */
  velocity(vx, vy, vz) {
    const s = this.scale;
    return [vx * s, (vz * this.ground - vy) * s];
  }
}

/** Named cameras. `side` matches the library's old floor squash; `topdown` is a 3/4 RPG view. */
export const VIEWS = {
  side: new Camera({ ground: 0.16 }),
  topdown: new Camera({ pitch: Math.PI / 5, ground: 0.6 }),
};

/**
 * Pick a camera from an effect's meta or a caller's options. Accepts a Camera, a name ("side", "topdown"),
 * or an options object ({ pitch } or { ground }). Returns null when no camera was asked for.
 */
export function cameraFor(o = {}) {
  const c = o.camera ?? o.view;
  if (c instanceof Camera) return c;
  if (typeof c === "string") return VIEWS[c] ?? null;
  if (c && typeof c === "object") return new Camera(c);
  return null;
}
