---
slug: what-is-a-game-loop
title: What is a game loop?
kind: reading
access: free
xp: 5
---

Every game, from Pong to an open-world RPG, runs the same three steps over and over:

1. **Process input** — what did the player press?
2. **Update** — advance the simulation by a small slice of time.
3. **Render** — draw the current state to the screen.

In this course you'll write `update` and `render` functions; the platform runs the loop.
Here is the same loop in a few languages. Each one reads the elapsed time, then runs the
three steps in order:

```ts group=loop
let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  const input = readInput();        // 1. process input
  state = update(state, dt, input); // 2. update
  render(ctx, state);               // 3. render
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

```cpp group=loop
// raylib
while (!WindowShouldClose()) {
    float dt = GetFrameTime();
    Input input = ReadInput();        // 1. process input
    state = Update(state, dt, input); // 2. update
    BeginDrawing();                   // 3. render
    Render(state);
    EndDrawing();
}
```

```csharp group=loop
// Raylib-cs
while (!Raylib.WindowShouldClose()) {
    float dt = Raylib.GetFrameTime();
    Input input = ReadInput();        // 1. process input
    state = Update(state, dt, input); // 2. update
    Raylib.BeginDrawing();            // 3. render
    Render(state);
    Raylib.EndDrawing();
}
```

```odin group=loop
// vendor:raylib
for !rl.WindowShouldClose() {
    dt := rl.GetFrameTime()
    input := read_input()             // 1. process input
    state = update(state, dt, input)  // 2. update
    rl.BeginDrawing()                 // 3. render
    render(state)
    rl.EndDrawing()
}
```

Engines like Unity, Godot and MonoGame own this loop for you. They call your code from
inside it: Unity's `Update()` covers steps 1 and 2, and the engine does step 3 itself.
The loop is still there, you just don't write it.

## Try it

Below is a complete little game in the shape you'll use all course: `init`, `update` and
`render`. Drag the sliders, or edit the code. Click the canvas and hold **Space** to
send the input step something to read.

```ts playground
export const WIDTH = 320;
export const HEIGHT = 240;

// Radians per second.
const SPEED = 2; // @range 0..10 step 0.1
const ORBIT = 80; // @range 10..110
const SIZE = 12; // @range 2..40

type State = { angle: number };

export function init(): State {
  return { angle: 0 };
}

export function update(state: State, dt: number, input: { keys: Record<string, boolean> }): State {
  const direction = input.keys[" "] ? -1 : 1;
  return { angle: state.angle + direction * SPEED * dt };
}

export function render(ctx: CanvasRenderingContext2D, state: State) {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "#262f52";
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2, ORBIT, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  const x = WIDTH / 2 + Math.cos(state.angle) * ORBIT;
  const y = HEIGHT / 2 + Math.sin(state.angle) * ORBIT;
  ctx.arc(x, y, SIZE, 0, Math.PI * 2);
  ctx.fill();
}
```

Notice that changing `SPEED` doesn't restart anything. The loop keeps calling `update`
with the same state, and only the rule for the next step has changed.
