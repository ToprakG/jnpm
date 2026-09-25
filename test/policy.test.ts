import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "../src/jev/policy.js";

const base = { rangesOk: true, peersOk: true, majorsDiffer: false, kind: "dedupe" };

test("broken ranges and peers are rejected without Jev", () => {
  assert.deepEqual(decide({ ...base, peersOk: false, jev: null }), { outcome: "reject", askedJev: false });
  assert.deepEqual(decide({ ...base, rangesOk: false, kind: "unsafe", jev: null }), { outcome: "reject", askedJev: false });
  assert.deepEqual(decide({ ...base, rangesOk: false, kind: "review-upgrade", jev: null }), { outcome: "review", askedJev: false });
});

test("a missing judgment sends the grey area to review", () => {
  assert.deepEqual(decide({ ...base, jev: null }), { outcome: "review", askedJev: false });
});

test("thresholds and the major-version ceiling", () => {
  const jev = { noul: 0.95, action: "apply" as const, confidence: 0.8, model: "typesafe/jev-1.13" };
  assert.equal(decide({ ...base, jev }).outcome, "apply");
  assert.equal(decide({ ...base, majorsDiffer: true, jev }).outcome, "review");
  assert.equal(decide({ ...base, jev: { ...jev, noul: 0.85 } }).outcome, "apply");
  assert.equal(decide({ ...base, jev: { ...jev, noul: 0.84 } }).outcome, "review");
  assert.equal(decide({ ...base, jev: { ...jev, noul: 0.45 } }).outcome, "review");
  assert.equal(decide({ ...base, jev: { ...jev, noul: 0.44 } }).outcome, "reject");
  assert.equal(decide({ ...base, jev: { ...jev, action: "review" } }).outcome, "review");
  assert.equal(decide({ ...base, jev: { ...jev, action: "reject" } }).outcome, "reject");
});
