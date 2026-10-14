#!/usr/bin/env sh
# hGATE agent Stop-hook example (Claude Code format). Blocks the agent from
# finishing a turn while traceability verification fails, so it cannot claim
# completion on SKILL.md obedience alone. Install manually: copy this file to
# .claude/hooks/hgate-verify-stop.sh, chmod +x it, and merge
# templates/hooks/claude-settings.stop-hook.json into .claude/settings.json.
#
# Exit 2 + stderr feeds the failure back to the agent and keeps it working.

input=$(cat)

# Avoid an endless loop: if the agent is already continuing because of this
# hook, let it stop and let CI / the human catch what remains.
case "$input" in
  *'"stop_hook_active": true'*|*'"stop_hook_active":true'*) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only gate projects that adopted the verifier.
[ -f tools/bdd-traceability/verify.mjs ] || exit 0

run() {
  output=$("$@" 2>&1) || {
    printf 'hGATE verification failed: %s\n%s\n' "$*" "$output" >&2
    exit 2
  }
}

if [ -f tools/verify-spec/verify.mjs ]; then
  run npm run --silent verify:spec
fi
run npm run --silent verify:bdd
if ls .github/skills/*/properties.md >/dev/null 2>&1; then
  run npm run --silent verify:properties
fi
exit 0
