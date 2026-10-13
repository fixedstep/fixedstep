export const WIDTH = 320;
export const HEIGHT = 240;

export type Ball = { x: number; y: number; vx: number; vy: number; r: number };

export function init(): Ball {
  return { x: 160, y: 120, vx: 120, vy: 90, r: 10 };
}

export function update(ball: Ball, dt: number): Ball {
  const next = { ...ball, x: ball.x + ball.vx * dt, y: ball.y + ball.vy * dt };
  // TODO: bounce off the walls
  return next;
}

export function render(ctx: CanvasRenderingContext2D, ball: Ball) {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
}
