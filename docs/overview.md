# Overview

P4 Studio는 P4 코드에 의존하지 않고 공개 wire 계약만 추적한다. 웹 서버는 SQLite에 운영 지식과 브라우저가 기록한 실행 receipt만 저장한다. 브라우저가 P4 OUTER와 명령 흐름을 소유하며, 서버는 same-origin WebSocket과 agent TCP 사이에서 불투명한 P4 bytes만 전달한다.

초기 범위는 에이전트, 노드, 모델, 파이프라인 레지스트리와 표준 P4 event-v3 기반 에이전트 머신·노드 관측이다.
