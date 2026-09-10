# API

서비스 API는 루트 [API 문서](../../../docs/api.md)를 따른다. API DTO는 `src/common/domain.ts`가 소유한다.

에이전트 등록 DTO는 `name`, `host`, `port`이며 어댑터는 노드 선언 DTO에만 포함한다.

에이전트 view DTO는 transient `inspection`을 포함한다. `available` snapshot은 machine의 OS·arch·cores·adapters와 agent node의 id·generation·adapter kind·opaque state를 전달한다.
