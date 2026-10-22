#!/usr/bin/env bash
# Pipes sample PreToolUse payloads through role-guard.sh and asserts the exit codes.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
guard="$here/role-guard.sh"
export CLAUDE_PROJECT_DIR=/repo
pass=0
fail=0

run() { # expect role tool json-input
  local expect="$1" role="$2" payload="$3" got err
  err="$(printf '%s' "$payload" | bash "$guard" "$role" 2>&1 >/dev/null)"
  got=$?
  if [[ "$got" == "$expect" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL [$role] expected $expect got $got: $payload"
    [[ -n "$err" ]] && echo "     stderr: $err"
  fi
}

edit() { jq -nc --arg t "$1" --arg p "$2" '{tool_name:$t, tool_input:{file_path:$p}}'; }
bash_cmd() { jq -nc --arg c "$1" '{tool_name:"Bash", tool_input:{command:$c}}'; }
allow() { run 0 "$@"; }
deny() { run 2 "$@"; }

# designer
allow designer "$(edit Edit /repo/tasks/in-progress/x.md)"
allow designer "$(edit Write /repo/tasks/todo/new.md)"
allow designer "$(edit MultiEdit tasks/in-progress/x.md)"
deny designer "$(edit Edit /repo/apps/api/src/x.ts)"
deny designer "$(edit Edit /repo/tasks/in-progress/x.ts)"
deny designer "$(edit Write /repo/tasks/../CLAUDE.md)"
deny designer "$(edit Write /repo/tasks-other/x.md)"
deny designer "$(edit Edit /repo/CLAUDE.md)"
deny designer '{"tool_name":"NotebookEdit","tool_input":{"notebook_path":"/repo/x.ipynb"}}'
allow designer "$(bash_cmd 'git commit -m x')" # designer has no Bash; matcher never sends it

# tester
allow tester "$(edit Edit /repo/apps/api/src/x.test.ts)"
allow tester "$(edit Write /repo/apps/web/src/App.test.tsx)"
deny tester "$(edit Edit /repo/apps/api/src/x.ts)"
deny tester "$(edit Write /repo/apps/api/src/x.test.ts.bak)"
deny tester "$(edit MultiEdit /repo/tasks/in-progress/x.md)"
deny tester "$(edit Edit /repo/apps/api/src/x.spec.ts)"

# reviewer: allowed
for c in \
  'git diff origin/main...HEAD' \
  'git status --porcelain' \
  'git rev-parse HEAD' \
  'git log --oneline origin/main..HEAD' \
  'git --no-pager show HEAD:CLAUDE.md' \
  'git -C /repo diff --stat' \
  'git diff --name-only abc..HEAD' \
  'cd /repo && git diff origin/main...HEAD' \
  'cd /repo && node_modules/.bin/biome check .' \
  './node_modules/.bin/biome check .' \
  '/repo/node_modules/.bin/vitest run --configLoader runner' \
  'node_modules/.bin/tsc -p apps/api --noEmit' \
  'for_x=1 node_modules/.bin/tsc -p infra --noEmit' \
  'node_modules/.bin/vitest run --configLoader runner 2>&1 | tail -40' \
  'node_modules/.bin/tsc -p apps/web --noEmit && node_modules/.bin/tsc -p apps/api --noEmit' \
  'grep -rn "a|b>c" apps/api/src | head' \
  "grep -E 'x;y|z' -o file" \
  'rg -n foo apps; ls tasks' \
  'find apps -name "*.test.ts" | wc -l' \
  'find apps -name "*.ts" -o -name "*.tsx" | sort -u' \
  "sed -n '1,40p' apps/api/src/index.ts" \
  'cat package.json | jq .scripts' \
  'git diff origin/main...HEAD 2>/dev/null || git diff main...HEAD' \
  'pnpm lint' \
  'ls -la >/dev/null' \
  $'git status --porcelain\ngit rev-parse HEAD'; do
  allow reviewer "$(bash_cmd "$c")"
done

# reviewer: blocked
for c in \
  'git commit -m x' \
  'git push origin HEAD' \
  'git checkout main' \
  'git diff --output=patch.diff' \
  'cd /repo && git commit -am x' \
  'git diff && git reset --hard' \
  'git status; rm -rf apps' \
  'git log | tee log.txt' \
  'git diff > out.diff' \
  'git diff >> out.diff' \
  'cat x &>out.txt' \
  'echo hi > apps/api/src/x.ts' \
  'node_modules/.bin/biome check --write .' \
  'node_modules/.bin/biome check --fix .' \
  'node_modules/.bin/biome format .' \
  'node_modules/.bin/tsc -p apps/api' \
  'node_modules/.bin/vitest run -u' \
  'node_modules/.bin/vitest' \
  "sed -i 's/a/b/' x.ts" \
  "sed -n -i 's/a/b/' x.ts" \
  "sed 's/a/b/' x.ts" \
  'find . -name "*.tmp" -delete' \
  'find . -exec rm {} \;' \
  'sort -o out.txt in.txt' \
  'git diff --name-only | sort -uo out.txt' \
  'cat $(echo /etc/passwd)' \
  'cat `whoami`' \
  'node -e "require(\"fs\").writeFileSync(\"x\",\"\")"' \
  'pnpm install' \
  'rg --pre ./x.sh foo' \
  'git -c core.pager=sh log' \
  'rm x' \
  'git diff & touch x' \
  $'git status\ntouch x'; do
  deny reviewer "$(bash_cmd "$c")"
done
allow reviewer "$(edit Edit /repo/apps/api/src/x.ts)" # reviewer has no Edit; guard ignores it

# fail-open cases
allow unknown "$(bash_cmd 'git commit -m x')"
allow reviewer 'not json'
allow reviewer ''
allow tester '{"tool_name":"Edit","tool_input":{}}'

echo "role-guard tests: $pass passed, $fail failed"
[[ "$fail" == 0 ]]
