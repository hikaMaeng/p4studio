# P4 latest contract verification

Created: 2026-10-03 KST. Goal: Studio가 P4 `4b62e3e4`(경량 브로커, OUTPUT v6, resource_profile v2)의 agent와 조회·LOAD·SESSION·추론·UNLOAD를 수행하는지 실제 Chrome에서 확인한다. 계약 변경표는 [P4 참조 안내](../../docs/p4-reference.md)가 소유한다.

Environment: Windows 11, RTX 4080 + RTX 3090 한 머신. P4 저장소는 read-only 참조이며 수정하지 않는다. agent는 P4 HEAD 소스를 Studio의 무시 폴더(`test/20261003/p4-agent-build`)로 빌드한다. staged native server와 Gemma-4 12B Q4 GGUF는 P4의 [로컬 실행 기록](../../../p4/tests/reports/p4-lightweight-broker/local-ts-ab-20261002/final-binding.json)이 결속한 파일을 그대로 쓴다. Studio는 `npm run deploy`의 Docker 컨테이너(`127.0.0.1:43120`)다.

Preconditions: 포트 52000·52001·24110·24111 미사용, GPU에 다른 P4 프로세스 없음, agent 두 개가 `P4_EVENT_AGENT_READY`를 출력.

1. 배포 전 빌드에서 agent를 등록하고 조회한다. 가설: `broker.receipts` 부재로 조회가 실패한다.
2. 수정 빌드를 배포하고 컨테이너 번들 SHA-256을 로컬 빌드와 대조한다.
3. 같은 agent를 조회한다. 머신·GPU·홉 전송이 표시되어야 한다.
4. P4 `nodes-sealed.json`의 두 노드 설정으로 2-stage 배치를 저장하고 모델 화면에서 LOAD한다. 두 stage가 `ready`, INSPECT node의 `load_generation`이 배치의 값과 같아야 한다.
5. 인퍼런스 화면에서 단일 요청, 이어서 동시 4건을 보낸다. 모두 `완료`이고 답변이 온전한 문장이어야 한다.
6. 상태 새로고침 후에도 `ready`, 이어서 UNLOAD. 두 stage `unloaded`/`absent`, INSPECT `nodes` 0, native 프로세스 0이어야 한다.
7. `npm run typecheck`, `npm test`, `npm run build`.

Locator: role/name 기반. 버튼 `에이전트 등록`, `정보 새로고침`, `모델 로딩`, `모델 언로딩`, `상태 새로고침`, `질의 전송`; textbox `에이전트 이름`, `호스트`, `포트`, `동시 질의 수`, `최대 생성 토큰`, `프롬프트`. 결과 표의 행은 접근 가능한 이름이 없어 좌표로 열었다.

Evidence: `test/20261003/134500_p4-latest/`의 agent stdout/stderr, INSPECT 원문(`inspect-*.json`), 배치 입력, Chrome 스크린샷.

- [검증 결과](../reports/p4-latest-contract/20261003_135500.md)
