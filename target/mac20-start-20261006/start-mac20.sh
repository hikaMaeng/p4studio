#!/bin/bash
set -euo pipefail
task_root=/Users/mobimac/p4-agent-current
[ "$(shasum -a256 "$task_root/p4-agent" | awk '{print $1}')" = 78491ee21b7e672567f297cfe8202103fa880301c5c62597d45e8daca7eaea73 ]
[ "$(shasum -a256 "$task_root/p4_staged_server" | awk '{print $1}')" = 2d8467eb9a0e6312964e98e2ac15525b8430fdc3f5a5d6d42f3f99688c1d1e63 ]
if lsof -nP -iTCP:52000 -sTCP:LISTEN >/dev/null 2>&1; then echo 'Already listening; no new process started'; exit 1; fi
if pgrep -f '^/Users/mobimac/p4-agent-current/p4-agent' >/dev/null; then echo 'Existing agent found; no new process started'; exit 1; fi
bash -n "$task_root/run-agent-52000.sh"
if [ -f "$task_root/agent.log" ]; then cp -p "$task_root/agent.log" "$task_root/agent.log.before-start-$(date +%Y%m%d-%H%M%S)"; fi
nohup bash "$task_root/run-agent-52000.sh" > "$task_root/agent.log" 2>&1 < /dev/null &
task_pid=$!
printf '%s\n' "$task_pid" > "$task_root/agent.pid"
for task_try in $(seq 1 100); do
 if grep -q P4_EVENT_AGENT_READY "$task_root/agent.log"; then break; fi
 kill -0 "$task_pid"
 sleep .1
done
grep 'P4_STAGED_NATIVE_STARTUP state=configured' "$task_root/agent.log"
grep P4_EVENT_AGENT_READY "$task_root/agent.log"
kill -0 "$task_pid"
lsof -nP -a -p "$task_pid" -iTCP:52000 -sTCP:LISTEN
printf 'STARTED pid=%s\n' "$task_pid"
