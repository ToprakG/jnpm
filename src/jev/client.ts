import type { JevJudgment } from "./policy.js";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";

export type JevClient = {
  judge(state: Record<string, unknown>): Promise<JevJudgment>;
};

type DecisionResponse = {
  model?: string;
  answers?: {
    compatible?: { noul?: number };
    action?: { choice?: string; confidence?: number };
  };
};

export function clientFromEnv(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): JevClient | null {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    judge: (state) => judgeCandidate(state, apiKey, fetchImpl),
  };
}

export async function judgeCandidate(
  state: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JevJudgment> {
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      state,
      questions: {
        compatible: {
          type: "noul",
          instructions: "Would collapsing onto the proposed version likely preserve application behavior?",
          criteria: {
            true: "Every parent range already accepts the proposed version and behavior stays the same.",
            false: "The change can break a dependent, a peer, or application behavior.",
          },
        },
        action: {
          type: "choice",
          instructions: "What should JNPM do with this optimization candidate?",
          criteria: {
            apply: "Safe to apply automatically.",
            review: "A person should review this before it is applied.",
            reject: "Do not apply this change.",
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Jev request failed with ${response.status}`);
  }

  const body = (await response.json()) as DecisionResponse;
  const noul = body.answers?.compatible?.noul;
  const action = body.answers?.action?.choice;
  const confidence = body.answers?.action?.confidence;
  if (typeof noul !== "number" || (action !== "apply" && action !== "review" && action !== "reject")) {
    throw new Error("Jev returned an unexpected decision payload");
  }

  return {
    noul,
    action,
    confidence: typeof confidence === "number" ? confidence : 0,
    model: body.model || MODEL,
  };
}
