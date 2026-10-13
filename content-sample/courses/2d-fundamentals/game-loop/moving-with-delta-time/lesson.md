---
slug: moving-with-delta-time
title: Moving with delta time
kind: code
access: free
xp: 10
---

Frames don't arrive at a perfectly steady rate. If you move an object a fixed number of
pixels *per frame*, it moves faster on a 144 Hz monitor than on a 60 Hz one.

The fix is to scale movement by **delta time** (`dt`), the seconds elapsed since the last
update:

```
position = position + velocity * dt
```

## Assignment

Implement `move(pos, vel, dt)`. It returns a **new** position (don't mutate `pos`) after
moving with velocity `vel` (pixels per second) for `dt` seconds.
