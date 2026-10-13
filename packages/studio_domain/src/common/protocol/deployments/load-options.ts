/** 과거 LOAD 실행 경로는 읽기·편집·저장 시 무시한다. docs/api.md#agent-native 참조. */
export function withoutLegacyBinary(text: string): string {
  try {
    const options: unknown = JSON.parse(text);
    if (!options || typeof options !== "object" || Array.isArray(options) || !("binary" in options)) return text;
    delete (options as Record<string, unknown>).binary;
    return JSON.stringify(options, null, 2);
  } catch { return text; } // 작성 중인 JSON은 보존하고 LOAD 검증에서 거부한다.
}
