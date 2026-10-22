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
allow tester "$(edit Edit apps/api/src/x.test.ts)"
allow tester "$(edit Edit /repo/apps/api/src/../src/x.test.ts)"
# A *.test.ts symlink to a production file resolves to the production file.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
touch "$tmp/prod.ts"
ln -s "$tmp/prod.ts" "$tmp/link.test.ts"
deny tester "$(edit Write "$tmp/link.test.ts")"

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
  'CI=1 node_modules/.bin/tsc -p infra --noEmit' \
  'NO_COLOR=1 FORCE_COLOR=0 node_modules/.bin/vitest run --configLoader runner' \
  "grep -n 'biome check --write .' CLAUDE.md" \
  'rg -n -- "--output=x|--fix" .claude' \
  "sed --sandbox -n -e '/end/p' apps/api/src/index.ts" \
  "sed --sandbox -n '/^export /p;/return/p' apps/api/src/index.ts" \
  "sed --sandbox -n '/-ignore /p' f" \
  "git diff --stat && sed --sandbox -n '1,20p' f" \
  "echo 'a\$b' \"<(x)\"" \
  'sort -T /tmp -u f' \
  'node_modules/.bin/vitest run --configLoader runner 2>&1 | tail -40' \
  'node_modules/.bin/tsc -p apps/web --noEmit && node_modules/.bin/tsc -p apps/api --noEmit' \
  'grep -rn "a|b>c" apps/api/src | head' \
  "grep -E 'x;y|z' -o file" \
  'rg -n foo apps; ls tasks' \
  'find apps -name "*.test.ts" | wc -l' \
  'find apps -name "*.ts" -o -name "*.tsx" | sort -u' \
  "sed --sandbox -n '1,40p' apps/api/src/index.ts" \
  'pnpm test' \
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
  'node_modules/.bin/vitest run --update' \
  'pnpm test -u' \
  'pnpm test --update' \
  'pnpm test -- -u' \
  'uniq a b' \
  'sort f | uniq' \
  'node_modules/.bin/vitest' \
  "sed -i 's/a/b/' x.ts" \
  "sed -n -i 's/a/b/' x.ts" \
  "sed 's/a/b/' x.ts" \
  "sed -n '1p' f" \
  "sed -n '1,40p' apps/api/src/index.ts" \
  "sed -n --sandbox '1p' f" \
  "sed --sandbox '1p' f" \
  "sed --sandbox -n -i 's/a/b/' x.ts" \
  "sed --sandbox -n -si 's/a/b/' x.ts" \
  "sed --sandbox -n -i~ '1p' x.ts" \
  "sed --sandbox -n '-i.bak' '1p' x.ts" \
  "sed --sandbox -n --in-place '1p' x.ts" \
  "sed --sandbox -n --i '1p' x.ts" \
  "sed --sandbox -n 1p x.ts -- -i" \
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
  'for_x=1 node_modules/.bin/tsc -p infra --noEmit' \
  'GIT_EXTERNAL_DIFF=rm git diff' \
  'GIT_PAGER=sh git log' \
  'LD_PRELOAD=/tmp/x.so ls' \
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.pager GIT_CONFIG_VALUE_0=sh git log' \
  'CI=1 GIT_PAGER=sh git log' \
  'FOO=bar' \
  "echo \$'\\'' ; touch x ; echo ''" \
  'cat <(touch x)' \
  'diff <(git show HEAD:a) a' \
  "sed -n '1e touch x' f" \
  "sed -n '1e touch x --sandbox ' f" \
  "sed -n '1e touch x' f -- --sandbox" \
  "sed -n '1eid' f" \
  "sed -n 's/a/b/wout.txt' f" \
  "sed -n '1e\\ id' f" \
  "git diff --stat && sed -n '1e id' f" \
  "sed --sandbox -n '1p' f; sed -n '1e id' f" \
  "sed --sandbox -n '1p' f | sed '1e id'" \
  "sed -n '\$e id' f" \
  "sed -n '1,5w out.txt' f" \
  "sed -n 's/a/b/e' f" \
  "sed -n 's/a/b/gw out.txt' f" \
  "sed -n '1r /etc/passwd' f" \
  "sed -n '/x/{p;W out.txt}' f" \
  'sort --compress-program=sh f' \
  'sort --compress-prog sh f' \
  'sort --output=out.txt f' \
  'git log --outp=x' \
  'node_modules/.bin/vitest run --reporter=json --outputFile=x.json' \
  'node_modules/.bin/biome check --apply-unsafe .' \
  'pnpm lint --write' \
  './x.sh' \
  '/repo/x.sh' \
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
