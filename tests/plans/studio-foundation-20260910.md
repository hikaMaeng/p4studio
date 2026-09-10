# Test Plan: Studio Foundation

## Created

2026-09-10

## Goal

SQLite registry, protocol boundary, production server, dark UI shell, and primary creation flows work together without relaying inference traffic.

## Environment

Windows, Node 26 local build, Node 24 container contract, npm 11.17.0, P4 Studio port 43120.

## Preconditions

- `npm install` completed from committed lockfile.
- Demo-only SQLite path is separate from the default database.
- Production bundle exists under `apps/studio/dist`.

## Steps

1. Run typecheck, integration tests, and production build.
2. Start the production server with demo seeding against a disposable SQLite file.
3. Check `/health` and `/api/snapshot`.
4. Open the production UI and inspect console errors.
5. Verify navigation, dashboard topology, agent cards, and dialogs.
6. Create one agent through the visible form and confirm it appears in the agent list.

## Expected Results

- Health is `status=ok`, tests pass, and build emits front/server artifacts.
- One `main` and one named primary navigation exist.
- Demo topology renders two ordered stages without claiming protocol health.
- Form labels are unique and registration produces a visible card.
- Browser console has no errors.

## Logs To Capture

Build/test summaries, server ready line, health JSON, browser console errors, and UI screenshot.

## Locator Contract

- Role: `main`, navigation `주 탐색`, dialog titles.
- Label: `에이전트 이름`, `호스트`, `포트`.
- Text: `운영 개요`, `에이전트 등록`, `파이프라인 토폴로지`.
- Test ids: `agent-card`, `pipeline-stage`, `pipeline-topology`, `stage-editor-row`.
