type PaddleEvent = { name: string; data?: { transaction_id?: string } };
type Paddle = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: {
    open: (options: {
      transactionId: string;
      settings: { locale: "es" | "en"; theme: "dark"; showAddDiscounts: false };
    }) => void;
  };
};
type PaddleWindow = Window & { Paddle?: Paddle };
let loading: Promise<Paddle> | undefined;
let initializedToken: string | undefined;
let eventCallback: ((event: PaddleEvent) => void) | undefined;

function load() {
  const present = (window as PaddleWindow).Paddle;
  if (present) return Promise.resolve(present);
  loading ??= new Promise<Paddle>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const paddle = (window as PaddleWindow).Paddle;
      if (paddle) resolve(paddle);
      else reject(new Error("BILLING_UNAVAILABLE"));
    };
    script.onerror = () => reject(new Error("BILLING_UNAVAILABLE"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export async function openPaddleCheckout(
  checkout: { environment: "sandbox" | "live"; clientToken: string; transactionId: string },
  locale: "es" | "en",
  onEvent: (event: PaddleEvent) => void,
) {
  const paddle = await load();
  if (initializedToken !== undefined && initializedToken !== checkout.clientToken)
    throw new Error("BILLING_UNAVAILABLE");
  eventCallback = onEvent;
  if (!initializedToken) {
    if (checkout.environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({
      token: checkout.clientToken,
      eventCallback: (event) => eventCallback?.(event),
    });
    initializedToken = checkout.clientToken;
  }
  paddle.Checkout.open({
    transactionId: checkout.transactionId,
    settings: { locale, theme: "dark", showAddDiscounts: false },
  });
}
