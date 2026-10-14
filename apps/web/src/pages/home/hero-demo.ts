// A 3D wireframe cube, drawn with nothing but a 2D canvas and a little math.
// Drag the sliders, or change anything below. It updates live.
export const WIDTH = 320;
export const HEIGHT = 240;

const SPIN = 0.8; // @range 0..4 step 0.05
const TILT = 0.45; // @range 0..1.5 step 0.05
const FOV = 70; // @range 20..120
const DISTANCE = 4.5; // @range 3..10 step 0.1

type State = { angle: number };
type Vec3 = [number, number, number];

export function init(): State {
  return { angle: 0 };
}

export function update(state: State, dt: number): State {
  return { angle: state.angle + SPIN * dt };
}

// The 8 corners of a cube, and the 12 edges joining corners that differ in one axis.
const corners: Vec3[] = [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((y) => [-1, 1].map((z): Vec3 => [x, y, z])),
);
const edges = corners.flatMap((a, i) =>
  corners.flatMap((b, j) =>
    j > i && a.filter((v, k) => v !== b[k]).length === 1 ? [[i, j] as const] : [],
  ),
);

// Rotate around Y (spin), then X (tilt), then perspective-divide onto the screen.
export function project([x, y, z]: Vec3, spin: number, tilt = TILT): Vec3 {
  const x1 = x * Math.cos(spin) + z * Math.sin(spin);
  const z1 = -x * Math.sin(spin) + z * Math.cos(spin);
  const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
  const depth = z2 + DISTANCE;
  const focal = HEIGHT / 2 / Math.tan((FOV * Math.PI) / 360);
  return [WIDTH / 2 + (x1 * focal) / depth, HEIGHT / 2 - (y2 * focal) / depth, depth];
}

function line(ctx: CanvasRenderingContext2D, a: Vec3, b: Vec3) {
  if (a[2] < 0.2 || b[2] < 0.2) return; // behind the camera
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

export function render(ctx: CanvasRenderingContext2D, state: State) {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Floor grid, so the perspective is easy to see.
  ctx.strokeStyle = "#262f52";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    line(ctx, project([i, -1.6, -3], 0), project([i, -1.6, 3], 0));
    line(ctx, project([-3, -1.6, i], 0), project([3, -1.6, i], 0));
  }

  // Cube edges: nearer edges are brighter.
  const points = corners.map((c) => project(c, state.angle));
  ctx.lineWidth = 2;
  for (const [i, j] of edges) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    const near = Math.min(1, Math.max(0, (DISTANCE + 1.8 - (a[2] + b[2]) / 2) / 3.6));
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.35 + 0.65 * near})`;
    line(ctx, a, b);
  }
  ctx.fillStyle = "#ffd166";
  for (const [x, y] of points) ctx.fillRect(x - 2, y - 2, 4, 4);
}
