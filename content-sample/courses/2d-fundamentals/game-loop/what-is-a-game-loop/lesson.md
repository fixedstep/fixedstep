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
Here is what that loop looks like in a few engines and languages:

```ts group=loop
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  state = update(state, dt, input);
  render(ctx, state);
  requestAnimationFrame(frame);
}
```

```cpp group=loop
while (!WindowShouldClose()) {
    float dt = GetFrameTime();
    state = Update(state, dt, input);
    BeginDrawing();
    Render(state);
    EndDrawing();
}
```

```csharp group=loop
// Unity calls this once per frame for you.
void Update() {
    float dt = Time.deltaTime;
    transform.position += velocity * dt;
}
```

```odin group=loop
for !rl.WindowShouldClose() {
    dt := rl.GetFrameTime()
    state = update(state, dt, input)
    rl.BeginDrawing()
    render(state)
    rl.EndDrawing()
}
```
