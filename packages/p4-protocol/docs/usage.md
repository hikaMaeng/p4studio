# Usage

```ts
import {
  decodeAgentInspectionResponse,
  encodeAgentInspectionRequest,
} from "@p4studio/p4-protocol";

const event = encodeAgentInspectionRequest({ agentAddress, correlationId });
const snapshot = decodeAgentInspectionResponse(responseEvent, correlationId);
```

`event`는 P4 event bytes이며 TCP 길이 prefix는 transport에서 추가한다.
