# Usage

```sh
npm install
npm run dev
```

개발 UI는 `http://127.0.0.1:43121`, API는 `.env`의 `P4STUDIO_PORT`에서 실행된다.
주기적인 agent inspection 동시 연결 수는 `P4STUDIO_AGENT_INSPECTION_CONCURRENCY`로 조정한다.

```sh
npm run deploy
```

배포 명령은 Compose 서비스를 자동 탐색하고, 의존성·로컬 빌드 산출물·이미지 변경 여부를 확인한 뒤 필요한 경우에만 루트 Compose stack을 갱신한다. 서비스가 여러 개면 `npm run deploy <service>`로 대상을 지정한다. 헬스 경로는 `--health-path=/health`로 지정할 수 있다.
성공 시 실제 공개 포트의 `/health`를 확인하고 `deploy-total status=ok ...` 보고를 출력한다.
