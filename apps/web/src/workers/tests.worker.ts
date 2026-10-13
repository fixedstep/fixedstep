import { functionExecutor, type GradeRequest, grade } from "@fixedstep/test-harness";

// Typed via the DOM lib (one tsconfig for the app); in a worker, `self` is the worker scope.
const scope = self as unknown as Worker;

scope.onmessage = async (e: MessageEvent<GradeRequest>) => {
  scope.postMessage(await grade(e.data, functionExecutor));
};
