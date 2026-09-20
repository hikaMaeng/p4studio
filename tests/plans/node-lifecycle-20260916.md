# Node lifecycle verification

Created: 2026-09-16 KST. Goal: Studio를 P4의 Agent LOAD/UNLOAD 계약에 결속하고 이전 CREATE 흐름·거짓 완료·다른 노드 회수를 차단한다.

Environment: Windows, npm/Turbo workspaces; P4는 공개 소스 read-only 참조. 기존 Studio dirty 변경을 보존한다. 브라우저는 번들 Playwright와 설치된 Chrome, 별도 메모리 SQLite와 임시 loopback 포트의 모의 Agent만 사용한다.

1. Rust/Python 고정 lifecycle payload를 TS에서 소비·생성 비교하고 길이·schema·capacity·identity·opaque bytes를 검사한다.
2. 실제 domain 소비 경로에서 정상 LOAD/UNLOAD, 중복 ID 거부, 부분 성공 회수, native/cleanup 오류, busy 재시도, timeout, 잘못된 결과, 저장 실패, generation 재사용을 검사한다.
3. Browser connection의 binary 전달과 correlation/causation/OUTER identity를 확인한다. HTTP receipt generation 지속·감소 거부와 미해결 배치 편집 차단을 확인한다.
4. `npm run typecheck`, `npm test`, `npm run build`; architecture/i18n/docs 스킬 검사와 `git diff --check`.
5. 브라우저에서 모델 생성 deep URL→stage 추가·입력→저장→LOAD→UNLOAD→재LOAD, 부분 실패→회수, 새로고침과 back/forward를 확인한다. Agent fixture가 실제 wire payload·node 수를 기록한다.

Expected: CREATE/DELETE 0, Agent-target lifecycle만 발행, 모든 stage 완료 후 ready, UNLOAD 후 nodes 0, 부분 실패의 첫 오류 보존과 성공 sibling 회수, stable node ID/higher generation, 관측된 점유 노드의 새 LOAD 연결 금지.

Locator: role/name, input label, model article accessible name, `flow-agent-<id>`, `flow-node-<agent>:<node>:<generation>`, `model-node-inspector`; CSS는 포트 존재 여부 등 문서화된 ReactFlow handle 증거에만 사용한다.

Evidence: `test/20260916/*_node-lifecycle/` browser script·screenshots·wire log, `target/node-lifecycle/` 명령 로그, `tests/reports/node-lifecycle/` 결과. 실제 모델·GPU 수용은 미실행으로 별도 기록한다.

- [노드 수명 검증 결과](../reports/node-lifecycle/20260916_120900.md)
