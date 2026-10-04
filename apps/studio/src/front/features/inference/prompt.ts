/** Model-specific prompt formatting belongs to the Studio OUTER. */
export function wirePrompt(model: { stages: readonly { artifact: string }[] }, prompt: string): string {
  if (model.stages.some(stage => /gemma[\s_-]?4/i.test(stage.artifact))) {
    return `<|turn>user\n${prompt.trim()}<turn|>\n<|turn>model\n<|channel>thought\n<channel|>`;
  }
  // Qwen3.5's recorded 122B run uses the GGUF no-thinking suffix, including
  // both blank lines. A bare assistant header enables reasoning output.
  if (model.stages.some(stage => /qwen3\.5(?:$|[^a-z0-9])/i.test(stage.artifact))) {
    return `<|im_start|>user\n${prompt.trim()}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
  }
  if (!model.stages.some(stage => /qwen/i.test(stage.artifact))) return prompt;
  return `<|im_start|>user\n${prompt.trim()}\n<|im_end|>\n<|im_start|>assistant\n`;
}

export function wireOptions(model: { stages: readonly { artifact: string }[] }): string {
  if (model.stages.some(stage => /gemma[\s_-]?4/i.test(stage.artifact))) {
    return JSON.stringify({ temperature: 0, seed: 7, top_k: 64, stop: ["<turn|>"] });
  }
  return "";
}
