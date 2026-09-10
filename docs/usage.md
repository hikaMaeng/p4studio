# Usage

```powershell
npm install
npm run dev
```

개발 UI는 `http://127.0.0.1:43121`, API는 `.env`의 `P4STUDIO_PORT`에서 실행된다.
주기적인 agent inspection 동시 연결 수는 `P4STUDIO_AGENT_INSPECTION_CONCURRENCY`로 조정한다.

```powershell
npm run deploy
```

배포 명령은 로컬 빌드 후 루트 Compose stack을 갱신한다.
성공 시 실제 공개 포트의 `/health`를 확인하고 `deploy-total status=ok ...` 보고를 출력한다.
