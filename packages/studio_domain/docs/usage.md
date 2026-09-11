# Usage

앱은 실행 환경에 맞는 subpath에서 import한다. UI는 `/front`와 필요한 `/common`, 서버는 `/server`와 `/common`을 사용한다. 다른 패키지의 `src/`를 직접 import하지 않는다.

프런트 연결 예시는 [useModel.ts](../../../apps/studio/src/front/model/useModel.ts), 언어 적용은 [runtime.ts](../../../apps/studio/src/front/i18n/runtime.ts)다. `SliceModel.value`가 데이터이며 `getVersion()`은 렌더 갱신 신호다.

모델 배치 기능에서는 common schema로 입력을 검증하고 server 규칙에 전달한다. socket과 영속화는 앱에서 [DeploymentTransport](../src/server/deployments/runner.ts)·persist callback으로 연결한다. P4 payload 원본은 [참조표](../../../docs/p4-reference.md#source-map)를 따라 확인한다.
