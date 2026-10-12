import { expect, it } from "vitest";
import { addBatchRequestDistributions, summarizeBatchRequestDistributions, batchRequestStatistics, emptyBatchRequestDistributions } from "./batch-requests.js";
import { parseInferenceRun, type P4BatchObservation } from "../../../common/protocol/inference/index.js";
import { speculativePathRatios, SPECULATIVE_REPLAY_WARNING_RATIO } from "./speculative/index.js";
const owner = (request_id: string, prefill_rows = 0, verify_rows = 1) => ({ request_id, prefill_rows, verify_rows, decode_rows: 0, replay_rows: 0,
  reply: { ingress_agent: "tcp://host:52000", channel: "outer", connection_generation: 1, correlation_id: "op", deadline_unix_ms: null },
  submission_event_id: request_id, sequence_id: 0, incarnation: 1, request_issue_index: 1, rows: [] });
it("1·2·3·4·5+를 세고 5+ 평균은 실제 소유자 수를 보존한다", () => {
  const value: P4BatchObservation = { observation_id: "one", load_generation: 1, session_id: "run", logical_ordinal: 1, logical_rows: 1,
    physical_batches: [1, 2, 3, 4, 7].map((count, index) => ({ execution_id: index, rows: count, prefill_rows: 0, decode_rows: 0, verify_rows: count, replay_rows: 0, request_count: 99, sequence_count: count, owned_requests: Array.from({ length: count }, (_, id) => owner(String(id))) })),
    mixed_physical_batches: 0, stage_ms: 1, idle_ms: 0, idle_gated: 0, ready_rows: 1, ready_sequences: 1 };
  const before = JSON.stringify(value);
  const result = summarizeBatchRequestDistributions(value); expect(JSON.stringify(value)).toBe(before);
  expect(result.all.buckets).toEqual([1, 1, 1, 1, 1]); expect(result.verify).toEqual(result.all);
  expect(batchRequestStatistics(result.all)).toEqual({ average: 17 / 5, multiRequestRatio: 4 / 5 });
  expect(batchRequestStatistics(result.decode)).toEqual({ average: null, multiRequestRatio: null });
  value.physical_batches = [{ ...value.physical_batches[0]!, owned_requests: [owner("a", 1), owner("a", 1), { ...owner("b", 0, 0), replay_rows: 1 }] }];
  const mixed = emptyBatchRequestDistributions(); addBatchRequestDistributions(mixed, value);
  expect(mixed.all.buckets).toEqual([0, 1, 0, 0, 0]); expect(mixed.prefill.buckets[0]).toBe(1); expect(mixed.verify.buckets[0]).toBe(1); expect(mixed.replay.buckets[0]).toBe(1);
  value.physical_batches[0]!.owned_requests = []; addBatchRequestDistributions(mixed, value); expect(mixed.all.batches).toBe(1);
});
it("미측정 경로는 0으로 바꾸지 않으며 비율 분모는 rounds다", () => {
  expect(speculativePathRatios(undefined)).toEqual({ full: null, direct: null, replay: null });
  expect(speculativePathRatios({ rounds: 20, full: 5, direct: 2, replay: 13 })).toEqual({ full: .25, direct: .1, replay: .65 });
  expect(SPECULATIVE_REPLAY_WARNING_RATIO).toBe(.65);
});
it("과거 run의 분포를 꾸미지 않고 새 분포를 왕복 저장한다", () => {
  const old = { id: "run", modelId: "model", modelName: "model", state: "completed", submitted: 0, completed: 0, createdAt: "", error: null, requests: [] };
  expect(parseInferenceRun(old).batchRequestDistributions).toBeUndefined();
  const distributions = emptyBatchRequestDistributions(); distributions.all = { buckets: [1, 0, 0, 0, 0], batches: 1, requests: 1, multiRequestBatches: 0 };
  expect(parseInferenceRun({ ...old, batchRequestDistributions: distributions }).batchRequestDistributions).toEqual(distributions);
});
