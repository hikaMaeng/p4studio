# Testing

통합 테스트는 in-memory SQLite와 Express app factory를 사용한다. inspector를 주입해 registration success/error와 machine/node DTO를 검사하고, 여러 agent 조회의 최대 동시성을 검증한다. 브라우저 acceptance는 실제 P4 agent를 등록하고 named machine/P4 node/Studio declaration section을 확인한다.
