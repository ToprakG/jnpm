export type Outcome = "apply" | "review" | "reject";

export type JevJudgment = {
  noul: number;
  action: Outcome;
  confidence: number;
  model: string;
};

export type PolicyInput = {
  rangesOk: boolean;
  peersOk: boolean;
  majorsDiffer: boolean;
  kind: string;
  jev: JevJudgment | null;
};

export function decide(input: PolicyInput): { outcome: Outcome; askedJev: boolean } {
  if (!input.peersOk && input.rangesOk) return { outcome: "reject", askedJev: false };
  if (input.kind === "review-upgrade" || !input.rangesOk) {
    if (input.kind === "review-upgrade") return { outcome: "review", askedJev: false };
    return { outcome: "reject", askedJev: false };
  }
  if (!input.jev) return { outcome: "review", askedJev: false };

  let outcome: Outcome;
  if (input.jev.noul < 0.45 || input.jev.action === "reject") outcome = "reject";
  else if (input.jev.noul < 0.85 || input.jev.action === "review") outcome = "review";
  else outcome = "apply";

  if (outcome === "apply" && input.majorsDiffer) outcome = "review";
  return { outcome, askedJev: true };
}
