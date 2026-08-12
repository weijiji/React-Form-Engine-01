import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's auto-cleanup relies on a global `afterEach`; with vitest globals off we
// register it explicitly so each test starts from a fresh DOM.
afterEach(cleanup);
