# Testing

모델 미결 요청은 [관측 회귀 시험](../packages/studio_domain/src/front/model/model-requests/work.test.ts), [owner·클리어 API 회귀 시험](../apps/studio/src/server/operations/model-requests.test.ts)에서 foreign capability/generation, 오래된·부분 부재, lease 없는 클리어, 단조 checkpoint, 비밀 노출 및 정산을 꾸미지 않는 회수를 검사한다. [브라우저 시나리오](../tests/browser/inference-cancellation.mjs)는 모델 메뉴의 조회·확인·원래 소유자 CANCEL·UNLOAD·전체 부재 후 클리어와 busy 거부 후 오류·owner 보존을 검사한다. 모사 시험과 실기 결과를 구분한다.

```powershell
npm run typecheck
npm test
npm run build
```

재사용 회귀 시험은 source 옆의 `*.test.ts`, 브라우저 시험은 `tests/browser/`, 격리 연동 시험은 `tests/integration/`, headless 입력은 `tests/headless/`에 둔다. 실행 보고·로그·스크린샷·trace·스냅샷은 `tests/artifacts/` 같은 무시된 로컬 경로에 쓴다. 일회성 시험 계획·날짜별 이력은 커밋하지 않으며 지속 검증 조건은 이 문서와 각 패키지의 testing 문서에 유지한다.

| 경계 | 검증 코드 / 계약 |
| --- | --- |
| P4 wire와 고정 응답 bytes | [Protocol testing](../packages/p4-protocol/docs/testing.md) |
| 배치·수명·취소·정산 도메인 | [Domain testing](../packages/studio_domain/docs/testing.md), [노드 수명](node-lifecycle.md) |
| HTTP·SQLite·브라우저 소비자와 locator | [Studio testing](../apps/studio/docs/testing.md) |
| FINISH/ACK와 연결 회수 | [connection-teardown.mjs](../tests/integration/connection-teardown.mjs), [finish.test.ts](../apps/studio/src/server/agent-socket/finish.test.ts) |
| 반복 요청과 반환 연결 수명 | [socket-lifecycle.mjs](../tests/browser/socket-lifecycle.mjs), [reception.test.ts](../apps/studio/src/front/p4/reception.test.ts) |

브라우저는 단일 `main`, 이름 있는 `navigation`·섹션·폼, `status`·`alert`를 사용한다. 보이는 번역명으로 제어를 찾고 반복 항목에는 문서화된 test id를 사용한다. mock P4 시험, 실제 agent 연동, 모델·다중 머신 추론 수용을 구분한다. socket write나 과거 보고서만으로 LOAD·정산·자원 회수 성공을 판정하지 않는다.

브라우저 실행에는 Playwright와 Chromium을 환경에서 제공한다. 환경 runtime을 쓰면 `HEADLESS_BROWSER_PLAYWRIGHT_ROOT`와 `HEADLESS_BROWSER_EXECUTABLE`을 지정한다. `npm run build` 후 실제 서비스 URL과 무시된 출력 경로를 명시한다.

```powershell
node tests/browser/socket-lifecycle.mjs --url <studio-url> --out tests/artifacts/socket-lifecycle
node tests/browser/inference-cancellation.mjs --url <studio-url> --out tests/artifacts/inference-cancellation
node tests/browser/wave-results.mjs --url <studio-url> --out tests/artifacts/wave-results
node --import tsx tests/integration/connection-teardown.mjs --agent-binary=<test-owned-p4-agent.exe> --output=tests/artifacts/connection-teardown
```

연결 회수 시험은 명시한 테스트 소유 P4 바이너리, 임시 SQLite와 실제 Chromium/bridge를 사용해 INSPECT/FINISH ACK 및 해당 PID의 연결 부재를 검사한다. 제품 배포나 모델 적재를 수행하지 않는다. 단위·mock 시험의 통과를 실제 GPU 수용으로 확대하지 않는다.
