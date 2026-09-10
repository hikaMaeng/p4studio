# Constraints

- P4 구현 코드 import 금지
- adapter별 모델 의미 추가 금지
- inference relay operation 추가 금지
- 응답은 최대 8 MiB이며 event version 3, snapshot schema 1, correlation id를 모두 검증함
- node adapter state는 opaque 값으로 전달하며 adapter별 의미를 해석하지 않음
