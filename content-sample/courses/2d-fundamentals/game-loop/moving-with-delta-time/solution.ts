export type Vec2 = { x: number; y: number };

export function move(pos: Vec2, vel: Vec2, dt: number): Vec2 {
  return { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
}
