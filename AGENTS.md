# P4 Studio 작업 지침

## 프로젝트의 역할

이 저장소(`F:/dev/p4studio`)는 **`F:/dev/p4`의 P4 에이전트를 제어·관측하는 OUTER(아우터) 웹클라이언트**를 만드는 독립 프로젝트다. P4의 테스트 드라이버가 명시적으로 구성하던 모델 배치·노드·파이프라인과 운영 지식을 웹에서 관리한다.

- P4는 파이프라인 병렬 분산 추론의 통신·실행 연결 계층이다. agent 프로세스가 여러 node를 소유하고, 구상 adapter가 실제 추론 엔진을 실행한다.
- Studio는 에이전트 주소, 모델 파일, 구상 어댑터와 초기화 인자, stage별 레이어·장치 배치, 파이프라인 순서와 운영 정책을 소유한다. P4 코어에 이 지식을 넣지 않는다.
- P4에서 OUTER는 소켓 클라이언트다. 웹 화면이나 SQLite, Studio 서버의 내부 구조는 P4가 알아야 할 사항이 아니다.
- **P4 소스는 계약을 확인하는 참조 원본이며 빌드·런타임 의존성이 아니다.** P4 crate, 내부 모듈, 바이너리, 다른 저장소의 파일을 직접 import/link하거나 배포 이미지에 복사하지 않는다. Studio의 외부 의존 경계는 공개 P4 wire와 해당 adapter의 공개 payload 계약이다.

P4 개요, 소스별 참조표와 세션 취합 근거는 [P4 참조 안내](docs/p4-reference.md)에 있다.

## 작업 시작과 참조 순서

1. 두 저장소의 HEAD와 dirty/untracked 상태를 확인한다. 같은 저장소에서 진행 중인 다른 작업을 식별하고, 그 변경을 덮어쓰거나 이번 작업의 검증 결과로 합산하지 않는다.
2. [Studio 구조](docs/architecture.md), [제약](docs/constraints.md), [P4 참조 안내](docs/p4-reference.md)에서 수정할 계층과 소비자를 찾는다.
3. P4의 [문서 안내도](../p4/docs/document-map.md), [현재 로드맵](../p4/docs/distributed-batching-roadmap.md#current-status), [계층 격리 계약](../p4/docs/layer-isolation-contract.md)을 읽고 해당 기능의 계약 소유 문서로 내려간다. 현재 상태표와 과거 이력을 구분한다.
4. 문서에 해당하는 **현재 실행 코드 → 요청 생산자 → 응답 소비자 → 시험**까지 대조한 뒤 구현한다. 기본 경로는 `entrypoints/agent/src/event_runtime`와 `tools/event-drive`다. `layers/service`, `tools/drive`, 옛 Chain/Hop 예제는 경로가 다른 참고 자료다.
5. 코드와 계약이 다르면 차이·미지원 범위를 기록한다. 과거 세션의 완료 보고, operation 이름 목록, 문서의 목표만으로 지원 기능을 만들지 않는다. 필요할 때만 관련 Codex 세션을 추가로 읽는다.

```powershell
git -C F:/dev/p4studio status --short
git -C F:/dev/p4studio rev-parse HEAD
git -C F:/dev/p4 status --short
git -C F:/dev/p4 rev-parse HEAD
rg -n 'LoadCommand|SessionCommand|CONTENT_TYPE' F:/dev/p4/layers/adapters/llamacpp/staged/adapter/src/v2
```

다른 컴퓨터에서는 두 저장소의 실제 checkout 위치를 먼저 찾는다. `F:/dev/p4`를 제품 코드·환경 변수 기본값에 박아 넣지 않는다. Windows 도구에는 Windows 경로를, 실제 WSL 명령에만 `/mnt/f/...`를 사용한다.

## 모델·에이전트·노드의 의미

- 에이전트 등록은 관리 이름과 접속 주소의 등록이다. 에이전트 자체에 구상 어댑터나 모델을 귀속시키지 않는다. 한 머신에 한 에이전트로 여러 노드를 운영할 수 있으며, GPU 수를 노드 수의 고정 제한으로 삼지 않는다.
- 노드는 모델을 아직 적재하지 않은 실행 단위일 수 있다. 현재 P4 Create는 ID·generation·큐·adapter 객체를 만든다. **노드 생성 성공은 모델 적재 성공이 아니다.** 어댑터 선택은 노드 생성/배치 명령의 책임이다.
- 모델 파일 카탈로그와 실행 중인 모델 배치를 구분한다. 실행 모델은 여러 에이전트에 걸친 노드별 stage 적재로 실체화한다. 모델 화면을 파일 경로 한 개의 CRUD로만 취급하지 않는다.
- Studio가 각 stage의 대상 agent/node/generation, 모델 경로, 레이어 구간, 장치·offload·context·batch 인자를 구성한다. 파일·실행 바이너리 경로는 **대상 에이전트 머신의 경로**이며 Studio 서버에서 파일 존재를 확인했다고 원격 사용 가능성을 주장하지 않는다.
- entry agent는 target에 따라 로컬로 전달하거나 다른 agent로 forwarding한다. 전체 계획을 보고 P4가 자동으로 분할·모델 선택·장치 배치를 한다고 가정하지 않는다.
- CREATE, LOAD, SESSION, 추론, UNLOAD, DELETE를 구분한다. 모든 필수 stage의 현재 load generation에 대한 완료를 확인해야 전체 적재 성공이다. 추론 가능 여부는 별도의 SESSION 준비까지 확인한다.
- Studio의 배치 정책과 입력 검증은 OUTER가 소유하되, 모델별 합법적 cut·실제 메모리·KV·physical batching·sampling 검증과 실행은 adapter가 소유한다. 레이어 수를 균등 분할했다는 이유만으로 적재 가능성을 확정하지 않는다.

## 구현 경계

| 수정 종류 | Studio 수정 위치 | 확인할 P4 원본 |
| --- | --- | --- |
| 공통 envelope, endpoint, 버전, wire codec | `packages/p4-protocol/src/` | `layers/protocol/src/event/{mod,wire}.rs`, `entrypoints/agent/src/event_runtime/transport.rs` |
| 조회 및 node CREATE/DELETE | `apps/studio/src/server/agent-socket/`와 별도 도메인 규칙 | `entrypoints/agent/src/event_runtime/control.rs`, `control/inspection/` |
| 모델 배치·adapter별 payload·작업 상태 | `packages/studio_domain/src/common/`, `src/server/`; 앱은 I/O 연결 | `tools/event-drive/src/run/{config,load,mod,replies}.rs`, concrete adapter의 공개 command |
| SQLite·HTTP·프로세스 자원 | `apps/studio/src/server/` | P4는 참조 계약만; Studio 저장구조는 독립 |
| 화면·프런트 모델 | `apps/studio/src/front/`, `packages/studio_domain/src/front/` | P4 응답 의미를 도메인 계약으로 변환한 뒤 사용 |

상세 파일 링크와 심볼은 [기능별 참조표](docs/p4-reference.md#source-map)를 따른다. adapter별 payload 생성 코드를 backend 중립 `p4-protocol`에 넣지 않는다. 문서 읽기를 소스 import로 바꾸지 않는다.

- SQLite에는 관리·선언·의도한 배치와 작업 기록을 저장한다. 관측된 agent/node 상태는 별도 출처·관측 시각을 가진다. 저장된 선언을 실제 P4 노드나 현재 적재 상태로 표시하지 않는다.
- TCP 도달성, 프로토콜 조회 성공, 노드 존재, 모델 적재 완료, 추론 준비, 정상 응답을 별도 상태로 다룬다. timeout·단절은 미실행 증명이 아니므로 결과 불명과 확인된 실패를 구분하고 부분 성공을 보존한다.
- event/correlation/causation ID, endpoint와 node/load/connection generation, 순서와 content type을 유지한다. 재연결 시 식별자를 무조건 재사용하거나 timeout 명령을 무조건 재전송하지 않는다.
- 현재 P4의 TCP와 브라우저 WebSocket을 같은 것으로 취급하지 않는다. 조회·관리 제어용 서버 연결과 대량 추론 스트림을 구분하며, **Studio 서버가 추론 요청·토큰 스트림을 중계하는 구조를 암묵적으로 추가하지 않는다.** 추론 UI 구현 전 실제 클라이언트 transport와 OUTER 반환 경로를 확정한다. 현재 미제공인 브라우저 transport를 이미 지원한다고 기술하지 않는다.
- vLLM·SGLang 등은 확장 가능한 어댑터 예시다. 해당 P4 runtime의 adapter 등록과 공개 계약이 확인되지 않으면 사용 가능한 선택지로 광고하지 않는다.

## 화면 URL 계약

- 사용자가 독립적으로 열고, 새로고침하거나 북마크·공유·뒤로가기로 복원해야 하는 화면에는 반드시 canonical URL을 둔다. 여기에는 주 메뉴, 상세 대상, 상세의 하위 탭, 별도 등록·생성·편집 화면이 포함된다.
- URL에는 표시 이름이 아니라 안정적인 관리 ID를 사용하고, path segment는 encode/decode한다. 목록·상세·생성·편집·탭의 URL은 서로 구별되어야 하며 URL만으로 대상과 활성 화면을 결정할 수 있어야 한다.
- 메뉴·탭·상세 진입·생성/편집 진입은 브라우저 history를 갱신한다. 직접 deep URL 접속, 새로고침, back/forward가 동일한 화면과 대상·탭을 복원해야 한다. production Express fallback도 API가 아닌 GET deep URL에 프런트 `index.html`을 반환해야 한다.
- tooltip, popover, 일시적 menu open, hover, inline rename처럼 독립 화면이 아닌 짧은 상호작용은 URL을 만들지 않는다. 다만 독립 form/workflow로 분리되면 dialog 형태라도 URL을 가져야 한다.
- route parse/path 생성은 한 곳의 명시적 계약으로 유지하고, React root는 routing/surface 선택만 담당한다. feature의 지속 데이터·draft·I/O를 root routing state에 숨기지 않는다.
- UI 라우팅 변경은 메뉴/탭 클릭뿐 아니라 direct deep URL, reload, back/forward, ID URL encoding을 검증한다. 목록에 없는 대상 또는 알 수 없는 경로의 처리도 의도적으로 정하고, 무관한 화면으로 조용히 전환하지 않는다.

## 저장소 규칙과 검증

작업 분야에 맞는 `.codex/skills/` 지침을 적용한다. 모노레포는 현재 루트 `package.json`의 **npm workspaces + Turbo**, 정확한 버전과 패키지 경계를 따른다. 과거 세션의 pnpm 설정을 복원하지 않는다. React는 Model Render와 최소 slice 구독, 표시 문자열은 번역 resource key, Docker 실행·배포는 루트 단일 진입점 계약을 따른다.

- 프로토콜 수정은 Rust wire/fixture와의 바이트 호환, 크기·버전·identity 거부, 분할 수신·timeout 뒤 버퍼 보존 등 변경한 계약을 검사한다. TypeScript encode/decode 자체 왕복만으로 P4 호환을 증명하지 않는다.
- 제어 기능은 실제 응답 소비 경로에서 단계별 성공, 부분 실패, 중복/오래된 응답, 결과 불명, 정리 실패를 검증한다. 저장 버튼이나 socket write 성공을 LOAD 완료로 판정하지 않는다.
- UI 기능은 실제 브라우저 동선과 API/P4 결과를 함께 확인한다. 모델 적재·추론 완료 주장에는 대상 노드별 응답과 정상 출력 증거가 필요하다.
- 변경 범위에 맞게 `npm run typecheck`, `npm test`, `npm run build`를 실행한다. 문서만 수정하면 문서 구조·링크·`git diff --check`를 검사하며 무관한 GPU 실행이나 배포를 요구하지 않는다.
- 테스트/로컬 GREEN, 실제 에이전트 연동, 다중 머신 추론 수용은 별도 결과다. 성능 수치는 모델·topology·분모·측정창·정상 응답 여부를 붙인다. P4 전체 수용 기준은 [검증 규약](../p4/docs/distributed-batching-verification.md)에 있다.
- 계약 변경 시 관련 문서와 소비자 링크를 같은 변경에서 갱신한다. P4 지원 상태·최신 시험 수·TPS 표를 이 파일에 복제하지 않는다.

P4 자체 수정이 필요한 경우 먼저 공개 계약의 부족과 양쪽 영향 범위를 밝힌다. 이 저장소의 UI 수정 권한을 P4 배포·원격 프로세스 조작으로 확대하지 않는다. 실제 P4 파일을 수정하는 작업은 [P4 AGENTS.md](../p4/AGENTS.md)를 별도로 적용한다. 그 저장소의 전체 stage/commit 절차를 p4studio의 다른 진행 중 변경에 적용하지 않는다.
