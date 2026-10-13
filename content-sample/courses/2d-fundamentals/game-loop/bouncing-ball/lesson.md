---
slug: bouncing-ball
title: Bouncing ball
kind: sim
access: paid
xp: 25
---

Time to make something move on screen. The preview canvas is **320 × 240**. Your code
exports three functions, and the platform runs the loop:

- `init()` returns the starting state
- `update(state, dt, input)` returns the next state
- `render(ctx, state)` draws it

## Assignment

Make the ball bounce off all four walls. When the ball's edge (not its center) passes a
wall, push it back inside and flip that velocity component.
