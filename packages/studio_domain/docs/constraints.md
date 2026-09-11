# Constraints

| Subpath | Consumers | Invariants |
| --- | --- | --- |
| `/common` | Studio HTTP·영속화·프런트 API 소비자 | browser/node 전용 I/O 없이 동일 schema로 요청·응답 해석; 선언과 실행 결과 구분 |
| `/server` | Studio 모델 제어 연결부 | 실제 socket·DB는 주입; node 생성과 LOAD 완료 구분; stage identity·load generation 및 부분 실패 보존 |
| `/front` | Studio `useModel`·i18n·언어 선택 | React 의존 없음; model이 원본; slice별 구독과 unsubscribe 보존 |

패키지는 `apps/`나 `F:/dev/p4` 구현을 import하지 않는다. llama.cpp plan 문법은 common의 adapter payload 모듈에서 UI/서버가 함께 사용하며 backend 중립 wire 패키지로 옮기지 않는다. 관측된 하드웨어 수치를 제품 배치 성공으로 해석하지 않는다. [원문 인자와 실기 예제 계약](model-configurations.md)을 따른다.

이 패키지는 DOM을 렌더하지 않는다. 화면 locator는 [앱 constraints](../../../apps/studio/docs/constraints.md)와 [Studio testing](../../../docs/testing.md)이 소유한다.
