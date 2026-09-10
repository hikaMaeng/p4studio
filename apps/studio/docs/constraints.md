# Constraints

- 한 화면에 하나의 `main` landmark
- 주 탐색은 이름 있는 `nav`
- 주요 collection은 이름 있는 `section`; 항목은 `article` 또는 list item
- 입력은 visible label, dialog는 visible title을 사용
- 반복 pipeline stage와 agent card만 stable test id 사용
- reachability와 P4 inspection 성공을 별도 상태로 표시함
- agent는 어댑터를 소유하지 않으며 node 구성과 독립적으로 등록
- P4 node state는 opaque로 렌더링하며 Studio domain 상태로 해석하지 않음
- monitor fan-out은 검증된 동시성 설정으로 제한함
