import { describe, expect, it } from "vitest";
import { wireOptions, wirePrompt } from "./prompt.js";

describe("Studio inference prompt", () => {
  it("TUF 실측의 명시적 no-thinking 입력을 중복 포맷하지 않는다", () => {
    const input = '<|im_start|>user\n타입스크립트를 두 문장으로 설명하라<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';
    expect(wirePrompt({ stages: [{ artifact: 'C:/models/Qwen3.8-27B.gguf' }] }, input)).toBe(input);
  });
  it("MiMo 실측 입력과 샘플링을 그대로 생성한다", () => {
    const model = { stages: [{ artifact: '/models/MiMo-V2.6-Flash-RL-MXFP4.gguf' }] };
    expect(wirePrompt(model, ' 타입스크립트에 대해 설명하라 ')).toBe('<|im_start|>user\n타입스크립트에 대해 설명하라<|im_end|><|im_start|>assistant\n<think></think>');
    expect(JSON.parse(wireOptions(model))).toEqual({ temperature: 0, seed: 7, top_k: 64, stop: ['<|im_end|>'] });
    expect(JSON.parse(wireOptions({ stages: [{ artifact: 'Qwen3.8-27B.gguf' }] }))).toEqual({ temperature: 0, seed: 7, stop: ['<|im_end|>'] });
  });
  it("matches the successful Qwen3.5 122B no-thinking input byte for byte", () => {
    const model = { stages: [{ artifact: "S:\\models\\unsloth\\Qwen3.5-122B-A10B-MTP-GGUF\\Qwen3.5-122B-A10B-UD-Q5_K_S-00001-of-00003.gguf" }] };
    expect(wirePrompt(model, " 타입스크립트에 대해 설명하라 ")).toBe(
      "<|im_start|>user\n타입스크립트에 대해 설명하라<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n",
    );
  });
  it("preserves the other Qwen ChatML contract", () => {
    expect(wirePrompt({ stages: [{ artifact: "/models/Qwen3.8-27B.gguf" }] }, " hello ")).toBe(
      "<|im_start|>user\nhello\n<|im_end|>\n<|im_start|>assistant\n",
    );
  });
  it("wraps Gemma 4 with the verified turn template while retaining the visible prompt", () => {
    const model = { stages: [{ artifact: "G:\\gemma-4-12b-it-qat-q4_0.gguf" }] };
    expect(wirePrompt(model, " 타입스크립트에 대해 간략히 설명해 ")).toBe(
      "<|turn>user\n타입스크립트에 대해 간략히 설명해<turn|>\n<|turn>model\n<|channel>thought\n<channel|>",
    );
    expect(wireOptions(model)).toBe(
      '{"temperature":0,"seed":7,"top_k":64,"stop":["<turn|>"]}',
    );
  });
  it("preserves a non-Qwen prompt supplied by its caller", () => {
    const prompt = "<|turn>user\nhello<turn|>\n<|turn>model\n";
    expect(wirePrompt({ stages: [{ artifact: "/models/gemma.gguf" }] }, prompt)).toBe(prompt);
  });
});
