const submitted = new Map<string, { at: number; visible: boolean }>();

export function recordChatSubmit(turnId: string) {
  if (submitted.size >= 32) submitted.delete(submitted.keys().next().value!);
  submitted.set(turnId, { at: performance.now(), visible: false });
  console.info({ event: "mirai_chat_submitted", turnId });
}

export function recordFirstChatContent(turnId: string) {
  const timing = submitted.get(turnId);
  if (!timing || timing.visible || document.visibilityState !== "visible") return;
  timing.visible = true;
  console.info({
    event: "mirai_chat_first_content",
    turnId,
    durationMs: Math.round(performance.now() - timing.at),
  });
}
