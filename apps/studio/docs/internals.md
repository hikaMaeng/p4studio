# Internals

서버 build는 Node 24용 self-contained ESM bundle이다. front build 결과와 함께 `dist`만 runtime image로 복사된다.

시작 시 기존 `agents.adapter` 컬럼을 제거하는 호환 마이그레이션을 수행한다.

inspection client는 TCP 연결 후 32-bit little-endian 길이 prefix와 `P4E3` event bytes를 교환한다. TCP 연결 실패는 `unreachable`, 연결 뒤 P4 거부·timeout·decode 실패는 `reachable`과 `inspection.error`로 분리한다.
