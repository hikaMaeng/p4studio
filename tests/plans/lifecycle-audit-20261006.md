# Test Plan: LOAD / inference / stop / UNLOAD audit

최신 재검사: [2026-10-06 15:05 보고](../reports/lifecycle-audit/20261006_150500.md). 이전 반례를 그대로 재실행했으며 완료 조건을 변경하지 않았다.

## Created / Goal
2026-10-06. 사용자 요청의 모델 적재 뒤 추론 실패, 실패 뒤 UNLOAD busy, 중지 버튼 부재를 현재 실행 경로와 결정론적 반례로 조사한다. TUF 강제 초기화와 MiMo 10×10/5초 요청 보유 한도를 포함한다. 제품 기능을 수정·배포하거나 원격 프로세스를 조작하는 시험은 아니다.

## Environment / Preconditions
- Studio `1cfc8bf46058facc5ff58d21e2e11f0ac127b50e`, dirty working tree. P4 참조 `6be05d78bb1d6021b3f2309a7bb5c4fecaea0261`, dirty working tree. 다른 작업의 변경을 덮어쓰거나 이번 수정으로 집계하지 않는다.
- Windows PowerShell/Node, npm workspaces + Turbo. Chromium은 설치된 Chrome, Playwright는 bundled runtime.
- 배포 UI `http://127.0.0.1:43120`; 브라우저 시나리오는 HTTP와 binary P4 응답을 context별 모사한다. 실제 agent에 LOAD/PREFILL/UNLOAD를 보내지 않는다.
- 저장된 MiMo 선언과 TUF 복구 artifact는 읽기만 한다. 선언의 profile은 현재 적재된 native의 용량 증명이 아니다.

## Steps / Expected Results
| ID | 경로 / 기대 조건 |
| --- | --- |
| AUD-01~03 | 제출 2개 중 하나의 정확한 refusal: 다른 접수 요청의 결과를 보존하고, 오류 회수 또는 후속 UNLOAD가 원래 연결에서 CANCEL/정산을 수행한다 |
| AUD-04 | 자연 terminal OUTPUT와 RELEASE를 분리해 늦게 전달: RELEASE 소비 전에 반환 연결을 버리지 않는다 |
| AUD-05~06 | stale correlation / foreign request ERROR: 현재 실행에 적용하지 않는다 |
| AUD-07 | profile max_requests20, 10개씩 5초, 응답 없음: LOAD 용량 확대·사전 거부·대기 중 어느 것도 없이 30개를 맹목적으로 보내지 않는다. sequence_capacity를 보유 한도로 삼지 않는다 |
| AUD-09 | 실제 connection/reception과 binary SESSION/PREFILL, WebSocket close: 실행을 running에 방치하지 않고 결과 불명을 전달한다 |
| AUD-10 | unload/rejected/present 이후 빈 INSPECT: 강제 회수와 정상 UNLOAD 완료를 구별한다 |
| AUD-11 | 같은 ms에 동일 revision의 두 receipt: 둘째 변경은 충돌을 반환한다 |
| AUD-12~13 | 단일 노드 UNLOAD busy: 실패를 영속화하고 모델 UNLOAD와 같은 유한 wait를 적용한다 |
| AUD-C1 | 같은 fixture의 정상 SESSION: 첫 요청 2개가 running으로 제출된다 |
| UI-01 | 실행 중 요청 상세와 query back: 실행은 살아 있지만 상세의 중지 버튼이 사라지는지 확인 |
| UI-02 | binary 요청 오류: 전체 실패, CANCEL0, 중지·회수 제어 부재 확인 |
| UI-03 | 적재된 모델 삭제: 확인 없이 DELETE?discard=true, CANCEL0/UNLOAD0인지 확인 |

## Logs / Locator Contract
- 감사 전용 Vitest는 기본 회귀와 별도 실행하며 실패를 RED 반례로 보존한다. 성공하도록 원칙을 바꾸지 않는다.
- 실제 브라우저는 role/name, aria-expanded, `inference-request-row`, `inference-request-detail`, `inference-run-stop`, `model-row`를 사용한다. 화면·sent P4 event 종류·HTTP method/URL을 보존한다.
- `npm run typecheck`, `npm test`, `npm run build`, docs/i18n 구조 검사, `git diff --check`를 별도 집계한다.
- [실행 보고](../reports/lifecycle-audit/20261006_145500.md)에 명령, stdout, 소스 manifest, 재현 archive, 커버리지와 미검증 범위를 남긴다.

## Implementation and deployed follow-up

사용자의 추가 지시로 read-only 감사 이후 구현·배포·실기 범위로 확장했다. 최초 RED artifact는 보존한다. 새 수용은 [구현 보고](../reports/lifecycle-audit/20261006_163000.md)에 명령·stdout·배포·Chrome/P4/OS 증거와 미완 항목을 기록한다. AUD original13 + input budget3을 다시 실행하고, approved Windows runner의 OS identity/file-lock 소비, 부분 실패/재개/계속, forwarding gateway와 cross-tab lease를 검사한다. TUF 실제 force → LOAD → SESSION → 정상 출력 → submitted Stop/CANCEL/RELEASE → stage UNLOAD를 확인한다. MiMo10×10/5초는 총100건 생성·terminal/RELEASE·정상UNLOAD까지 별도 판정한다.
