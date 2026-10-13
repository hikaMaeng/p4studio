# Testing

모델 미결 요청은 [관측 회귀 시험](../packages/studio_domain/src/front/model/model-requests/work.test.ts), [owner·클리어 API 회귀 시험](../apps/studio/src/server/operations/model-requests.test.ts)에서 foreign capability/generation, 오래된·부분 부재, lease 없는 클리어, 단조 checkpoint, 비밀 노출 및 정산을 꾸미지 않는 회수를 검사한다. [브라우저 시나리오](../tests/browser/inference-cancellation.mjs)는 모델 메뉴의 조회·확인·원래 소유자 CANCEL·UNLOAD·전체 부재 후 클리어와 busy 거부 후 오류·owner 보존을 검사한다. 모사 시험과 실기 결과를 구분한다.

```powershell
npm run typecheck
npm test
npm run build
```

재사용 회귀 시험은 source 옆의 `*.test.ts`, 브라우저 시험은 `tests/browser/`, 격리 연동 시험은 `tests/integration/`, headless 입력은 `tests/headless/`에 둔다. 실행 보고·로그·스크린샷·trace·스냅샷은 `tests/artifacts/` 같은 무시된 로컬 경로에 쓴다. 일회성 시험 계획·날짜별 이력은 커밋하지 않으며 지속 검증 조건은 이 문서와 각 패키지의 testing 문서에 유지한다.

기록 모델 등록 스크립트의 호환 사전 검사, 부분 실패 진행 보고, 정상 등록, 재실행 중복 방지는 `node tests/integration/register-recorded-models.mjs --out tests/reports/studio-revamp/r3`로 메모리 HTTP 서버에서 검사한다. 같은 실행기가 TEMP 복사본에서 배치·카탈로그의 즉시 기록 호출을 제거한 변이도 검사한다. 결과 JSON은 무시된 `tests/reports/studio-revamp/r3/registration-report.json`에 남긴다.

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
node tests/browser/speculative-decoding.mjs --url <studio-url> --out tests/artifacts/speculative-decoding
node --import tsx tests/integration/connection-teardown.mjs --agent-binary=<test-owned-p4-agent.exe> --output=tests/artifacts/connection-teardown
```

연결 회수 시험은 명시한 테스트 소유 P4 바이너리, 임시 SQLite와 실제 Chromium/bridge를 사용해 INSPECT/FINISH ACK 및 해당 PID의 연결 부재를 검사한다. 제품 배포나 모델 적재를 수행하지 않는다. 단위·mock 시험의 통과를 실제 GPU 수용으로 확대하지 않는다.

개편 회귀는 [앱 시험 계약](../apps/studio/docs/testing.md#개편-회귀)과 [도메인 시험](../packages/studio_domain/docs/testing.md)을 따른다. `node tests/browser/studio-revamp.mjs --url http://127.0.0.1:43180 --out tests/artifacts/studio-revamp/scenario`. 격리 서버를 build 산출물로 실행하고 worktree 안 임시 SQLite를 명시한다. 운영 Studio를 교체하는 npm run deploy는 이 검증에서 사용하지 않는다.

Windows에서는 [시험 실행기](../tests/browser/run-studio-revamp.ps1)를 사용한다. `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/browser/run-studio-revamp.ps1 -Url http://127.0.0.1:43180 -Out tests/reports/studio-revamp/browser`. `SetErrorMode(0x8003)`를 자식에게 상속하고 Chromium의 breakpad·crash reporter·오류 대화상자를 끈다. 실행 후 테스트 전용 Chromium 경로의 잔류 프로세스 0 및 새 WER 프로세스 0을 검사한다. 사용자의 Chrome/WebView 프로세스는 종료하지 않는다.

숨김 디렉터리(`.cache`) 아래에서 Express의 정적 파일 처리가 404를 반환하면 `dist/front`, `dist/server`를 TEMP의 일반 경로로 복사해 같은 산출물을 실행한다. 임시 SQLite는 계속 작업 트리 안에 둔다. 숨김 파일 보호 정책을 시험 편의로 바꾸지 않는다. A2 변이 검사는 build 이후 `node tests/integration/studio-revamp-mutation.mjs --out tests/reports/studio-revamp/mutation`으로 실행한다. 정상 복사본 통과·호출 제거 복사본 실패·제품 파일 해시 유지가 모두 필요하다.

- [binary 제거 브라우저 시험](../tests/browser/no-binary.mjs)은 포트 43181의 격리 Studio·임시 SQLite에서 옛 선언을 직접 주입하고 deep URL·reload·배치 편집·저장, 실행 경로 입력/JSON/미리보기 부재와 8개 언어 안내를 검사한다. 실제 P4 연결은 0이어야 한다. [독립 변이](../tests/integration/no-binary-mutation.mjs)는 빌드 후 실행하며 결과는 무시된 `tests/reports/no-binary/`에 보존한다.

```powershell
# Windows 자식 프로세스의 크래시 대화상자를 끄고 Chromium·WER 잔류도 검사한다.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/browser/run-no-binary.ps1
node tests/integration/no-binary-mutation.mjs
node tests/integration/no-binary-preset-import.mjs
```

브라우저 시험은 이 worktree의 `apps/studio/dist`를 TEMP에 그대로 복사해 실행한다. `.cache` 경로를 Express `sendFile`이 숨김 경로로 거부하는 문제를 피해 제품 빌드 산출물을 검사하며 운영 서버·DB는 열지 않는다.

## 운영 실측 구성 브라우저 실행

[등록·실행 동선](../tests/browser/recorded-model-runs.mjs)은 운영 URL을 받아 모델 구성의 필드·stage 추가/편집·저장, 질의 설정·전송, 완료와 응답 전문·관측 화면을 검사한다. 직접 HTTP 등록·추론 호출은 하지 않는다. 실행 로그·JSON·스크린샷은 Git 제외 tests/reports에 둔다. 공유 이력은 새 브라우저 context의 기록 메뉴에서 복원해 확인한다. 다른 브라우저의 기록은 원래 OUTER 연결이나 실행 권한을 복원하지 않는다.
