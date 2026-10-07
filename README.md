# P4 Studio

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
| Unload and agent recovery contract | [docs/agent-recovery-plan.md](docs/agent-recovery-plan.md) |

Turbo remote cache는 기본 비활성이다. 공유 캐시 소유자와 자격 증명 흐름이 정해진 뒤에만 활성화한다.

- [노드 LOAD/UNLOAD 수명](docs/node-lifecycle.md)

Git에는 재사용 소스·시험·현재 계약을 보존한다. 단순 실행 이력과 생성물의 제외 경로는 [.gitignore](.gitignore), 검증 코드와 실행 방법은 [Testing](docs/testing.md)을 따른다.
