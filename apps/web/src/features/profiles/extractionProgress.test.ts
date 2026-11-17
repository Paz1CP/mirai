import { expect, it } from "vitest";
import { estimatedExtractionProgress } from "./estimatedProgress";

it("slows at the waiting boundaries and never reports completion", () => {
  expect(estimatedExtractionProgress(0)).toBe(0);
  expect(estimatedExtractionProgress(12000)).toBe(65);
  expect(estimatedExtractionProgress(40000)).toBe(90);
  expect(estimatedExtractionProgress(3600000)).toBe(95);
  expect(estimatedExtractionProgress(13000) - 65).toBeLessThan(estimatedExtractionProgress(1000));
});

