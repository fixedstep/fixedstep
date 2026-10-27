Frames don't all take the same time. How far should the object travel in one update if
`dt` is twice as long as usual?

---

Each axis moves by its velocity multiplied by `dt`: `vel.x * dt` along x and `vel.y * dt`
along y. Add those to the current position.

---

Build a fresh object rather than assigning to `pos`:

```ts
return { x: /* new x */, y: /* new y */ };
```
