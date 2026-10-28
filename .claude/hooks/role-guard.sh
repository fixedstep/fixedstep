#!/usr/bin/env bash
# role-guard.sh <role> — PreToolUse hook for the /ship-task agents (.claude/agents/*.md).
#
# Reads the hook JSON on stdin. Exit 2 blocks the tool call and shows stderr to the agent; exit 0
# allows it. Roles:
#   designer  Edit/Write/MultiEdit/NotebookEdit only on $CLAUDE_PROJECT_DIR/tasks/**/*.md
#   tester    Edit/Write/MultiEdit/NotebookEdit only on *.test.ts / *.test.tsx, and on a content
#             lesson's tests.ts / tests.hidden.ts (courses/<course>/<chapter>/<lesson>/)
#   course-tester  Edit/Write/MultiEdit/NotebookEdit only under $CLAUDE_PROJECT_DIR/e2e/
#             (not e2e/node_modules/)
#   reviewer  Bash limited to a read-only allowlist (git inspection, file reading, checks)
#
# This is a guard against mistakes, not a security boundary: a determined agent can get around
# a string-matching allowlist. Unknown roles and unparseable input fail open (exit 0 with a
# warning) so a broken guard never wedges an agent.
set -euo pipefail

role="${1:-}"
project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"

warn() { echo "role-guard: warning: $*" >&2; }
block() {
  echo "role-guard ($role): blocked: $*" >&2
  exit 2
}

input="$(cat)" || { warn "could not read stdin; allowing"; exit 0; }
if ! tool="$(jq -er '.tool_name' <<<"$input" 2>/dev/null)"; then
  warn "unparseable hook input; allowing"
  exit 0
fi

# Path an edit-type tool is about to write, or empty for other tools.
edit_path() {
  case "$tool" in
    Edit | Write | MultiEdit) jq -r '.tool_input.file_path // empty' <<<"$input" ;;
    NotebookEdit) jq -r '.tool_input.notebook_path // empty' <<<"$input" ;;
  esac
}

# Absolute, `..`-free form of a path (relative paths are taken from the project dir).
normalize() {
  local p="$1"
  [[ "$p" == /* ]] || p="$project_dir/$p"
  realpath -m -- "$p"
}

guard_designer() {
  local p
  p="$(edit_path)" || return 0
  [[ -n "$p" ]] || return 0
  p="$(normalize "$p")"
  local tasks
  tasks="$(normalize "$project_dir/tasks")"
  [[ "$p" == "$tasks"/*.md ]] ||
    block "$tool on $p. The designer may only edit task files (tasks/**/*.md)."
}

guard_tester() {
  local p
  p="$(edit_path)" || return 0
  [[ -n "$p" ]] || return 0
  p="$(normalize "$p")"
  case "$p" in
    *.test.ts | *.test.tsx) ;;
    *)
      # Lesson tests in a content repo (the private repo or content-sample/).
      [[ "$p" =~ /courses/[^/]+/[^/]+/[^/]+/tests(\.hidden)?\.ts$ ]] ||
        block "$tool on $p. The tester may only create or edit *.test.ts / *.test.tsx files and content lessons' tests.ts / tests.hidden.ts."
      ;;
  esac
}

guard_course_tester() {
  local p
  p="$(edit_path)" || return 0
  [[ -n "$p" ]] || return 0
  p="$(normalize "$p")"
  local e2e
  e2e="$(normalize "$project_dir/e2e")"
  [[ "$p" == "$e2e"/* && "$p" != "$e2e/node_modules"/* ]] ||
    block "$tool on $p. The course-tester may only edit files under e2e/ (not e2e/node_modules/)."
}

# --- reviewer: Bash allowlist ---------------------------------------------------------------

ALLOWED_DESC='git diff/log/show/status/rev-parse/check-ignore/ls-files/merge-base, cd, pwd,
echo, ls, cat, head, tail, wc, sort, diff, grep, rg, find, sed --sandbox -n, jq,
node_modules/.bin/{biome check, tsc --noEmit, vitest run}, pnpm lint/typecheck/test,
node_modules/.bin/tsx packages/content-cli/src/cli.ts validate [dir], node odin/check.mjs [--missing]'

# Splits $1 into command segments (one per line of the global `segments` array) on unquoted
# `&&`, `||`, `;`, `|`, `&` and newlines. Blocks unquoted output redirection (other than to
# /dev/null or another fd), command substitution outside single quotes, and unquoted ANSI-C
# quoting (`$'…'`, which this parser doesn't understand) and process substitution (`<(…)`).
segments=()
split_command() {
  local s="$1" cur="" q="" c n i len=${#1}
  for ((i = 0; i < len; i++)); do
    c="${s:i:1}"
    n="${s:i+1:1}"
    if [[ "$q" == "'" ]]; then
      cur+="$c"
      [[ "$c" == "'" ]] && q=""
      continue
    fi
    if [[ "$c" == "\\" ]]; then
      cur+="$c$n"
      i=$((i + 1))
      continue
    fi
    if [[ "$c" == '`' || ("$c" == '$' && "$n" == '(') ]]; then
      block "command substitution is not allowed in reviewer commands."
    fi
    if [[ "$q" == '"' ]]; then
      cur+="$c"
      [[ "$c" == '"' ]] && q=""
      continue
    fi
    case "$c" in
      "'" | '"')
        q="$c"
        cur+="$c"
        ;;
      '$')
        [[ "$n" == "'" ]] && block "\$'...' quoting is not allowed in reviewer commands; use plain quotes."
        cur+="$c"
        ;;
      '<')
        [[ "$n" == '(' ]] && block "process substitution <(...) is not allowed in reviewer commands."
        cur+="$c"
        ;;
      '>')
        # Allow `N>&M` / `>&M` and redirection to /dev/null; anything else writes a file.
        local rest="${s:i+1}"
        rest="${rest#>}"
        if [[ "$rest" =~ ^\&[0-9-] ]]; then
          cur+="$c"
        elif [[ "$rest" =~ ^[[:space:]]*/dev/null([[:space:]]|$|[\;\&\|]) ]]; then
          cur+="$c"
        else
          block "output redirection (>) is not allowed; the reviewer is read-only."
        fi
        ;;
      ';' | $'\n')
        segments+=("$cur")
        cur=""
        ;;
      '|')
        segments+=("$cur")
        cur=""
        [[ "$n" == '|' || "$n" == '&' ]] && i=$((i + 1))
        ;;
      '&')
        if [[ "$n" == '>' ]]; then
          cur+="$c" # `&>file`, checked by the '>' branch next
        elif [[ "$n" == '&' ]]; then
          segments+=("$cur")
          cur=""
          i=$((i + 1))
        elif [[ "${s:i-1:1}" == '>' || "${s:i-1:1}" == '<' ]]; then
          cur+="$c" # `2>&1`
        else
          segments+=("$cur")
          cur=""
        fi
        ;;
      *) cur+="$c" ;;
    esac
  done
  segments+=("$cur")
}

# Environment assignments allowed before a reviewer command (`CI=1 node_modules/.bin/vitest …`).
# Anything else (GIT_PAGER, GIT_EXTERNAL_DIFF, GIT_CONFIG_*, LD_PRELOAD, …) can run code.
ALLOWED_ENV='CI|NO_COLOR|FORCE_COLOR|TERM|LC_ALL|LANG'

check_segment() {
  local seg="$1"
  # Trim, then drop subshell/group punctuation and leading (allowlisted) env assignments.
  seg="${seg#"${seg%%[![:space:]]*}"}"
  seg="${seg%"${seg##*[![:space:]]}"}"
  while [[ "$seg" =~ ^[\(\{][[:space:]]*(.*)$ ]]; do seg="${BASH_REMATCH[1]}"; done
  while [[ "$seg" =~ ^(.*[^[:space:]])[[:space:]]*[\)\}]$ ]]; do seg="${BASH_REMATCH[1]}"; done
  [[ -z "$seg" ]] && return 0
  while [[ "$seg" =~ ^([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]*[[:space:]]+(.*)$ ]]; do
    local var="${BASH_REMATCH[1]}"
    seg="${BASH_REMATCH[2]}"
    [[ "$var" =~ ^($ALLOWED_ENV)$ ]] ||
      block "setting $var is not allowed; only $ALLOWED_ENV may prefix a reviewer command."
  done
  # Normalise tool paths: $CLAUDE_PROJECT_DIR/node_modules/.bin/x and ./node_modules/.bin/x.
  local stripped
  for stripped in "${seg#"$project_dir"/}" "${seg#./}"; do
    [[ "$stripped" == node_modules/.bin/* ]] && seg="$stripped"
  done
  # Normalise harmless git global options.
  if [[ "$seg" =~ ^git[[:space:]] ]]; then
    while [[ "$seg" =~ ^git[[:space:]]+(--no-pager|-C[[:space:]]+[^[:space:]]+)[[:space:]]+(.*)$ ]]; do
      seg="git ${BASH_REMATCH[2]}"
    done
  fi
  local words=" $seg "
  local cmd="${seg%%[[:space:]]*}"

  # Flags that write files, checked only for the commands where they do (so search text such
  # as `grep 'biome check --write'` stays allowed). pnpm passes extra args to biome/vitest.
  case "$cmd" in
    node_modules/.bin/biome | pnpm)
      [[ "$words" =~ [[:space:]](--write|--fix|--apply|--apply-unsafe)([[:space:]=]) ]] &&
        block "'${BASH_REMATCH[1]}' writes files; the reviewer only runs checks read-only."
      ;;&
    git | node_modules/.bin/vitest | pnpm)
      # git diff/log/show --output (and its abbreviations); vitest --outputFile.
      [[ "$words" =~ [[:space:]](--out[A-Za-z-]*)([[:space:]=]) ]] &&
        block "'${BASH_REMATCH[1]}' writes a file; the reviewer is read-only."
      ;;&
    node_modules/.bin/vitest | pnpm)
      # `pnpm test` forwards its args to vitest.
      [[ "$words" =~ [[:space:]](-u|--update)[[:space:]] ]] &&
        block "'${BASH_REMATCH[1]}' rewrites snapshots; the reviewer is read-only."
      ;;
  esac

  case "$cmd" in
    tee) block "tee writes files; the reviewer is read-only." ;;
    sort)
      # Of the allowed commands only sort writes with -o / --output (grep -o / find -o are
      # harmless), and --compress-program (any abbreviation, `--co…`) runs a program.
      [[ "$words" =~ [[:space:]]-[A-Za-z]*o ]] &&
        block "sort -o writes a file; the reviewer is read-only."
      [[ "$words" =~ [[:space:]]--o ]] &&
        block "sort --output writes a file; the reviewer is read-only."
      [[ "$words" =~ [[:space:]]--co ]] &&
        block "sort --compress-program runs a program; not allowed for the reviewer."
      return 0
      ;;
    rg)
      [[ "$words" =~ [[:space:]]--pre[[:space:]=] ]] &&
        block "rg --pre runs an arbitrary command; not allowed for the reviewer."
      return 0
      ;;
    cd | pwd | echo | ls | cat | head | tail | wc | diff | grep | jq) return 0 ;;
    find)
      [[ "$words" =~ [[:space:]](-delete|-exec|-execdir|-ok|-okdir|-fprint|-fprint0|-fprintf|-fls)[[:space:]] ]] &&
        block "find ${BASH_REMATCH[1]} is not allowed; the reviewer is read-only."
      return 0
      ;;
    sed)
      # Only `sed --sandbox -n …`: GNU sed's sandbox mode itself rejects the e (run a command),
      # w/W (write) and r/R (read) commands and the s///e, s///w flags, wherever they appear.
      [[ "$seg" =~ ^sed[[:space:]]+--sandbox[[:space:]]+-n([[:space:]]|$) ]] ||
        block "only 'sed --sandbox -n …' is allowed for the reviewer (or use the Read/Grep tools)."
      # --sandbox doesn't stop -i/--in-place (any abbreviation, `--i…`); match with quotes and
      # backslashes removed so `'-i~'` is caught too.
      local unquoted="${words//[\'\"\\]/}"
      [[ "$unquoted" =~ [[:space:]](-[A-Za-z]*i[^[:space:]]*|--i[^[:space:]]*)[[:space:]] ]] &&
        block "sed ${BASH_REMATCH[1]} edits files in place; the reviewer is read-only."
      return 0
      ;;
    git)
      [[ "$seg" =~ ^git[[:space:]]+(diff|log|show|status|rev-parse|check-ignore|ls-files|merge-base)([[:space:]]|$) ]] &&
        return 0
      ;;
    node_modules/.bin/biome)
      # --write/--fix/--apply were checked above.
      [[ "$seg" =~ ^node_modules/\.bin/biome[[:space:]]+check([[:space:]]|$) ]] && return 0
      ;;
    node_modules/.bin/tsc)
      [[ "$words" =~ [[:space:]]--noEmit[[:space:]] ]] && return 0
      block "tsc without --noEmit writes build output; use 'node_modules/.bin/tsc -p <pkg> --noEmit'."
      ;;
    node_modules/.bin/vitest)
      [[ "$seg" =~ ^node_modules/\.bin/vitest[[:space:]]+run([[:space:]]|$) ]] && return 0
      ;;
    pnpm)
      [[ "$seg" =~ ^pnpm[[:space:]]+(lint|typecheck|test)([[:space:]]|$) ]] && return 0
      ;;
    node_modules/.bin/tsx)
      # Only the content CLI's `validate` (the other subcommands write files), with at most a
      # content-dir argument. tsx runs any script, so the script path is fixed.
      [[ "$seg" =~ ^node_modules/\.bin/tsx[[:space:]]+packages/content-cli/src/cli\.ts[[:space:]]+validate([[:space:]]+[^[:space:]-][^[:space:]]*)?([[:space:]]+2>&1)?$ ]] &&
        return 0
      ;;
    node)
      # The content repo's Odin snippet check (read-only; `odin check` doesn't link), run from
      # the content repo root.
      [[ "$seg" =~ ^node[[:space:]]+odin/check\.mjs([[:space:]]+--missing)?([[:space:]]+2>&1)?$ ]] && return 0
      ;;
  esac
  block "'$seg' is not on the reviewer's read-only allowlist. Allowed: $ALLOWED_DESC.
See CLAUDE.md 'Running checks' for the check commands."
}

guard_reviewer() {
  [[ "$tool" == "Bash" ]] || return 0
  local command
  command="$(jq -r '.tool_input.command // empty' <<<"$input")"
  [[ -n "$command" ]] || return 0
  split_command "$command"
  local seg
  for seg in "${segments[@]}"; do
    check_segment "$seg"
  done
}

case "$role" in
  designer) guard_designer ;;
  tester) guard_tester ;;
  course-tester) guard_course_tester ;;
  reviewer) guard_reviewer ;;
  *) warn "unknown role '$role'; allowing" ;;
esac
exit 0
