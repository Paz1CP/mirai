import type { ChatPhase } from "@mirai/contracts";

export class ChatTiming {
  private readonly stages: Record<string, number> = {};
  private phase?: ChatPhase;
  private notify?: (phase: ChatPhase) => void;
  private calls = 0;

  constructor(readonly turnId: string, private readonly started = performance.now()) {}

  mark(stage: string, time = performance.now()) {
    this.stages[stage] ??= Math.round(time - this.started);
  }

  admission(outcome: string) {
    console.info({ event: "mirai_chat_admission", turnId: this.turnId, stagesMs: { ...this.stages }, outcome });
  }

  observe(notify: (phase: ChatPhase) => void) {
    this.notify = notify;
  }

  progress(phase: ChatPhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.notify?.(phase);
  }

  inference(sentAt: number) {
    this.mark("providerRequestSent", sentAt);
    this.progress("waiting");
    return ++this.calls;
  }

  finish(outcome: string) {
    this.mark("turnFinished");
    console.info({
      event: "mirai_chat_turn",
      turnId: this.turnId,
      stagesMs: this.stages,
      inferences: this.calls,
      lastPhase: this.phase,
      outcome,
    });
  }
}
