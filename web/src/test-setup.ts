import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// auto-cleanup only happens when vitest globals are on, so do it here
afterEach(() => cleanup());
