# Internals

버전 변경은 현재 P4 HEAD의 wire source와 compatibility test를 다시 확인한 뒤 수행한다.

inspection 요청은 `P4E3` event frame을 만들고 TCP transport의 32-bit little-endian 길이 prefix는 포함하지 않는다. 호출자가 transport framing을 소유한다. 응답 코덱은 표준 error result의 `detail`을 보존한다.
