---
slug: fixed-timestep-quiz
title: "Quiz: variable vs. fixed timestep"
kind: quiz
access: free
xp: 10
quiz:
  - id: why-dt
    prompt: Why multiply velocity by dt instead of moving a fixed amount per frame?
    options:
      - It makes the game run faster
      - Movement speed stays the same regardless of frame rate
      - It's required by the canvas API
    answer: 1
    explanation: Scaling by elapsed time makes speed frame-rate independent.
  - id: fixed-step-benefit
    prompt: What is the main benefit of a fixed timestep for physics?
    options:
      - Deterministic, reproducible simulation
      - Lower memory usage
      - Higher frame rate
    answer: 0
---

A **fixed timestep** advances the simulation in constant slices (say 1/60 s), running
zero, one or several updates per rendered frame to catch up with real time. That's how
this platform grades your `sim` lessons — and where its name comes from.
