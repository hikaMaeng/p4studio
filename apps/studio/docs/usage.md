# Usage

- 개발: `npm run dev --workspace @p4studio/studio`
- 빌드: `npm run build --workspace @p4studio/studio`
- 배포: 루트 `npm run deploy`

Compose에서 Windows 호스트의 로컬 agent를 등록할 때 agent는 `0.0.0.0`에 listen하고 `tcp://host.docker.internal:<port>`를 광고한다. Studio 등록 host도 `host.docker.internal`을 사용한다.
