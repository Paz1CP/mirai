const submitted = new Map<string, { clientSubmit: number; clientAckReceived?: number; firstContentRendered?: number }>();

export function recordChatSubmit(turnId: string) {
  if (submitted.size >= 32) submitted.delete(submitted.keys().next().value!);
  submitted.set(turnId, { clientSubmit: performance.now() });
  console.info({ event: "mirai_chat_submitted", turnId });
}

export function recordChatAck(turnId: string) {
  const timing = submitted.get(turnId);
  if (!timing || timing.clientAckReceived !== undefined) return;
  timing.clientAckReceived = performance.now() - timing.clientSubmit;
  console.info({
    event: "mirai_chat_ack",
    turnId,
    stagesMs: { clientSubmit: 0, clientAckReceived: Math.round(timing.clientAckReceived) },
  });
}

export function recordFirstChatContent(turnId: string) {
  const timing = submitted.get(turnId);
  if (!timing || timing.firstContentRendered !== undefined || document.visibilityState !== "visible") return;
  timing.firstContentRendered = performance.now() - timing.clientSubmit;
  console.info({
    event: "mirai_chat_first_content",
    turnId,
    stagesMs: {
      clientSubmit: 0,
      clientAckReceived: timing.clientAckReceived === undefined ? undefined : Math.round(timing.clientAckReceived),
      firstContentRendered: Math.round(timing.firstContentRendered),
    },
  });
}
