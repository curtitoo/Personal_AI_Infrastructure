#!/usr/bin/env bash
set -euo pipefail

# PAI Heartbeat Triage — invoked by IronClaw on a cron schedule.
# Lightweight: uses haiku with no tools/hooks to decide if escalation is needed.

STATE_DIR="$HOME/.claude/MEMORY/STATE"
STATE_FILE="$STATE_DIR/daemon-state.json"
LOG_DIR="$HOME/.claude/logs"

mkdir -p "$STATE_DIR" "$LOG_DIR"

# Bootstrap state file on first run
if [[ ! -f "$STATE_FILE" ]]; then
  printf '{"last_check":0,"status":"idle","escalation_count":0}\n' > "$STATE_FILE"
fi

prev_state=$(cat "$STATE_FILE")
last_check=$(echo "$prev_state" | jq -r '.last_check // 0')
now=$(date +%s)

# -- Gather signals since last check --
# Recent failures from the last hour of logs
recent_failures=$(find "$LOG_DIR" -name '*.error' -newer "$STATE_FILE" -exec tail -1 {} + 2>/dev/null | head -20 || true)

# New learnings captured since last heartbeat
learnings=""
if [[ -d "$HOME/.claude/MEMORY" ]]; then
  learnings=$(find "$HOME/.claude/MEMORY" -name '*.md' -newer "$STATE_FILE" -exec basename {} \; 2>/dev/null | head -10 || true)
fi

# -- Triage via lightweight Claude session (no tools, no hooks) --
triage_prompt="Previous state: $prev_state
Time since last check: $(( now - last_check ))s
Recent failures: ${recent_failures:-none}
New learnings: ${learnings:-none}

Respond with ONLY valid JSON: {\"action\":\"idle|escalate\",\"reason\":\"...\",\"priority\":\"low|medium|high\"}"

triage_result=$(claude --print \
  --model haiku \
  --tools '' \
  --output-format text \
  --setting-sources '' \
  --system-prompt "You are a PAI system health triage agent. Analyze signals and decide: idle (nothing actionable) or escalate (needs a full session). Be conservative — only escalate for real issues." \
  "$triage_prompt" 2>/dev/null) || triage_result='{"action":"idle","reason":"triage call failed","priority":"low"}'

# -- Persist updated state --
action=$(echo "$triage_result" | jq -r '.action // "idle"')
reason=$(echo "$triage_result" | jq -r '.reason // "no reason"')
esc_count=$(echo "$prev_state" | jq -r '.escalation_count // 0')

if [[ "$action" == "escalate" ]]; then
  esc_count=$(( esc_count + 1 ))
fi

jq -n \
  --argjson now "$now" \
  --arg status "$action" \
  --arg reason "$reason" \
  --argjson esc_count "$esc_count" \
  '{last_check: $now, status: $status, last_reason: $reason, escalation_count: $esc_count}' \
  > "$STATE_FILE"

# -- Escalate: spawn a full Claude session with hooks enabled --
if [[ "$action" == "escalate" ]]; then
  nohup claude --print \
    --model sonnet \
    --system-prompt "PAI escalation session. Triage reason: $reason. Investigate and resolve." \
    "Heartbeat triage escalated. Reason: $reason. Recent failures: ${recent_failures:-none}" \
    >> "$LOG_DIR/escalation-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
fi
