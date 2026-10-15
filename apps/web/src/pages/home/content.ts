/** Marketing copy for the home page, kept in one place so it's easy to edit. */

export const GITHUB_URL = "https://github.com/fixedstep/fixedstep";

export const PRICING = {
  monthly: { price: 20, label: "/ month" },
  yearly: { price: 200, label: "/ year", note: "2 months free" },
  free: [
    "Every free lesson, readings and quizzes",
    "Code editor and live canvas in your browser",
    "Instant local test runs",
    "XP and daily streaks",
  ],
  pro: [
    "Everything in Free",
    "Every Pro lesson in every course",
    "New courses as they're released",
    "Supports an open-source platform",
  ],
};

export const STEPS = [
  {
    title: "Read",
    body: "A short lesson introduces one idea, with the same code shown in TypeScript, C++, C# and Odin.",
  },
  {
    title: "Write",
    body: "Write real game code in the browser. Nothing to install, and your draft is saved as you go.",
  },
  {
    title: "Watch it run",
    body: "Your init, update and render run on a canvas at a fixed 60 steps per second, just like a real engine.",
  },
  {
    title: "Get checked",
    body: "Visible tests run instantly. On submit, the server re-runs them with hidden tests and awards XP.",
  },
];

// Placeholders: replace with the real roadmap.
export const ROADMAP = [
  {
    title: "Collision & physics",
    body: "Bounding boxes, circles, and resolving overlaps.",
    status: "Planned",
  },
  {
    title: "Input & game feel",
    body: "Keyboard and gamepad, buffering, and tuning how movement feels.",
    status: "Planned",
  },
  {
    title: "3D foundations",
    body: "Vectors, matrices and projection: the math behind the cube above.",
    status: "Planned",
  },
];

export const FAQ = [
  {
    q: "What language will I write?",
    a: "TypeScript, in the browser. Lessons also show each idea in C++, C# and Odin, so it carries over to engines like raylib, Unity or Godot.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. The editor, the canvas preview and the tests all run in your browser.",
  },
  {
    q: "I'm new to programming. Is this for me?",
    a: "Yes. Lessons are short and build on each other one step at a time. Some programming basics help, and the free lessons are a good way to find out.",
  },
  {
    q: "I already code. Will this be too basic?",
    a: "The early lessons move quickly. The focus is on how games work (game loops, timesteps, simulation), not on language basics.",
  },
  {
    q: "How is my code graded?",
    a: "Visible tests run in your browser for instant feedback. When you submit, the server runs them again along with hidden tests, and XP is only awarded once they pass.",
  },
  {
    q: "Can I cancel Pro?",
    a: "Yes, any time. Billing is handled by Polar, and you can manage or cancel your subscription from Polar's customer portal.",
  },
];
