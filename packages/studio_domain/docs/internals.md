# Internals

- [Emitter](../src/front/model/Emitter.ts)의 version은 데이터 snapshot이 아니라 변경 알림이다. React 밖에서 상태를 유지하고 작은 slice만 다시 그리기 위한 분리다.
- [SliceModel](../src/front/model/SliceModel.ts)은 `Object.is`로 같은 값의 `set` 알림을 생략하고 `mutate` 후 알린다. 알림 없이 value를 바꾸면 화면 동기화 계약을 깨뜨린다.
- [plan](../src/server/deployments/plan.ts)은 배치 입력으로 adapter payload를 만든다. P4가 모델 계획을 추론하지 않으므로 이 정책은 Studio에 속한다.
- [browser runtime](../src/common/protocol/deployments/runtime.ts)는 transport와 persist를 주입받는다. stage별 결과와 전송 불명을 I/O 구현과 분리해 검증하기 위한 경계다. 이 설계가 모든 실패를 이미 처리한다는 뜻은 아니다.

P4 engine/KV 내부 계산을 이 패키지로 가져오지 않는 이유와 원본 경로는 [P4 참조 안내](../../../docs/p4-reference.md)에 있다.

- 로딩은 노드별 Agent-target LOAD이며 생성이 포함된다. UNLOAD 성공은 자원·노드 제거 완료다. SESSION과 추론 연결은 생성하지 않는다. 성공한 모든 노드의 Loaded와 llama.cpp build identity 합의가 있어야 전체 ready다.
- timeout/소켓 단절은 unknown이다. 부분 성공과 최초 실패를 보존하고, 이전 작업을 정리하기 전 재로딩/편집을 거부한다. LOAD를 전송하지 않은 노드에 UNLOAD를 보내지 않는다.
- 각 로딩 시점의 agent 주소를 동결한다. 등록 주소 수정 뒤에도 UNLOAD는 원래 endpoint를 대상으로 한다. 서버 재시작 시 ready/loading/unloading 관측은 unknown으로 낮춘다.
- 현재 명령 전송은 대상별 게이트웨이 접수를 통해 순차 처리한다. 회수 시 새 OUTER channel을 사용하며 LOAD를 재전송하지 않는다. UI GET은 2초 주기이며 native 세부 진행률을 만들어 내지 않는다.
