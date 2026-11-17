// Estimated waiting progress never implies that the backend has completed.
export function estimatedExtractionProgress(milliseconds: number) {
  const elapsed = Math.max(0, milliseconds);
  return (
    Math.min(65, (elapsed * 65) / 12000) +
    Math.min(25, (Math.max(0, elapsed - 12000) * 25) / 28000) +
    Math.min(5, (Math.max(0, elapsed - 40000) * 5) / 100000)
  );
}
