# P4 Studio

[연결 회수 수정 계획](tests/plans/connection-teardown-20261005.md) · [조사·검증 기록](tests/reports/connection-teardown/20261005_042300.md): browser FINISH/ACK, 단절 fallback, 종료 drain과 P4 실제 연결 회귀. 운영 배포·모델 수용은 별도다.

P4 에이전트와 모델·노드·파이프라인 지식을 관리하는 독립 웹 콘솔이다.

| Topic | Path |
| --- | --- |
| Overview | [docs/overview.md](docs/overview.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| API | [docs/api.md](docs/api.md) |
| Usage | [docs/usage.md](docs/usage.md) |
| Constraints | [docs/constraints.md](docs/constraints.md) |
| Internals | [docs/internals.md](docs/internals.md) |
| Testing | [docs/testing.md](docs/testing.md) |
| Agent instructions | [AGENTS.md](AGENTS.md) |
| P4 OUTER reference | [docs/p4-reference.md](docs/p4-reference.md) |
| Inference observability | [docs/inference-observability.md](docs/inference-observability.md) |

Turbo remote cache는 기본 비활성이다. 공유 캐시 소유자와 자격 증명 흐름이 정해진 뒤에만 활성화한다.

- [노드 LOAD/UNLOAD 수명](docs/node-lifecycle.md)
- [노드 수명 검증계획](tests/plans/node-lifecycle-20260916.md)

- [노드 수명 검증 결과](tests/reports/node-lifecycle/20260916_120900.md)
