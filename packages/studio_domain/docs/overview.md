# Overview

Studio가 소유하는 데이터 계약·배치 규칙·프런트 상태를 앱 I/O와 분리한다. HTTP, SQLite, socket 구현과 React 화면 조립은 `apps/studio`에 둔다. P4의 내부 코드를 import하지 않는다.

2026-09-11 문서화 시 모델 deployment의 common/server 코드가 다른 작업에서 작성 중이었다. 파일·export 존재는 실제 에이전트 연동 완료의 증거가 아니다. [현재 소스 경로](architecture.md), [P4 역할과 조사 기준](../../../docs/p4-reference.md)을 함께 확인한다.
