#!/usr/bin/env bash
# role-guard.sh <role> — PreToolUse hook for the /ship-task agents (.claude/agents/*.md).
#
# Reads the hook JSON on stdin. Exit 2 blocks the tool call and shows stderr to the agent; exit 0
# allows it. Roles:
#   designer  Edit/Write/MultiEdit/NotebookEdit only on $CLAUDE_PROJECT_DIR/tasks/**/*.md
#   tester    Edit/Write/MultiEdit/NotebookEdit only on *.test.ts / *.test.tsx
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
  case "$p" in
    *.test.ts | *.test.tsx) ;;
    *) block "$tool on $p. The tester may only create or edit *.test.ts / *.test.tsx files." ;;
  esac
}

# --- reviewer: Bash allowlist ---------------------------------------------------------------

ALLOWED_DESC='git diff/log/show/status/rev-parse/check-ignore/ls-files/merge-base, cd, pwd,
echo, ls, cat, head, tail, wc, sort, uniq, diff, grep, rg, find, sed -n, jq,
node_modules/.bin/{biome check, tsc --noEmit, vitest run}, pnpm lint/typecheck/test'

# Splits $1 into command segments (one per line of the global `segments` array) on unquoted
# `&&`, `||`, `;`, `|`, `&` and newlines. Blocks unquoted output redirection (other than to
# /dev/null or another fd) and command substitution outside single quotes.
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

check_segment() {
  local seg="$1"
  # Trim, then drop subshell/group punctuation and leading env assignments.
  seg="${seg#"${seg%%[![:space:]]*}"}"
  seg="${seg%"${seg##*[![:space:]]}"}"
  while [[ "$seg" =~ ^[\(\{][[:space:]]*(.*)$ ]]; do seg="${BASH_REMATCH[1]}"; done
  while [[ "$seg" =~ ^(.*[^[:space:]])[[:space:]]*[\)\}]$ ]]; do seg="${BASH_REMATCH[1]}"; done
  [[ -z "$seg" ]] && return 0
  while [[ "$seg" =~ ^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+(.*)$ ]]; do
    seg="${BASH_REMATCH[1]}"
  done
  # Normalise tool paths: $CLAUDE_PROJECT_DIR/node_modules/.bin/x and ./node_modules/.bin/x.
  seg="${seg#"$project_dir"/}"
  seg="${seg#./}"
  # Normalise harmless git global options.
  if [[ "$seg" =~ ^git[[:space:]] ]]; then
    while [[ "$seg" =~ ^git[[:space:]]+(--no-pager|-C[[:space:]]+[^[:space:]]+)[[:space:]]+(.*)$ ]]; do
      seg="git ${BASH_REMATCH[2]}"
    done
  fi
  local words=" $seg "

  # Flags that write files, whatever the command.
  [[ "$words" =~ [[:space:]](--write|--fix|--apply|--apply-unsafe)([[:space:]=]) ]] &&
    block "'${BASH_REMATCH[1]}' writes files; the reviewer only runs checks read-only."
  [[ "$words" =~ [[:space:]](--output[A-Za-z-]*)([[:space:]=]) ]] &&
    block "'${BASH_REMATCH[1]}' writes a file; the reviewer is read-only."

  local cmd="${seg%%[[:space:]]*}"
  case "$cmd" in
    tee) block "tee writes files; the reviewer is read-only." ;;
    sort)
      # Of the allowed commands only sort writes with -o (grep -o / find -o are harmless).
      [[ "$words" =~ [[:space:]]-[A-Za-z]*o ]] &&
        block "sort -o writes a file; the reviewer is read-only."
      return 0
      ;;
    rg)
      [[ "$words" =~ [[:space:]]--pre[[:space:]=] ]] &&
        block "rg --pre runs an arbitrary command; not allowed for the reviewer."
      return 0
      ;;
    cd | pwd | echo | ls | cat | head | tail | wc | uniq | diff | grep | jq) return 0 ;;
    find)
      [[ "$words" =~ [[:space:]](-delete|-exec|-execdir|-ok|-okdir|-fprint|-fprint0|-fprintf|-fls)[[:space:]] ]] &&
        block "find ${BASH_REMATCH[1]} is not allowed; the reviewer is read-only."
      return 0
      ;;
    sed)
      [[ "$words" =~ [[:space:]](-[A-Za-z]*i[A-Za-z.]*|--in-place[^[:space:]]*)[[:space:]] ]] &&
        block "sed ${BASH_REMATCH[1]} edits files in place; the reviewer is read-only."
      [[ "$seg" =~ ^sed[[:space:]]+-n([[:space:]]|$) ]] && return 0
      ;;
    git)
      [[ "$seg" =~ ^git[[:space:]]+(diff|log|show|status|rev-parse|check-ignore|ls-files|merge-base)([[:space:]]|$) ]] &&
        return 0
      ;;
    node_modules/.bin/biome)
      [[ "$seg" =~ ^node_modules/\.bin/biome[[:space:]]+check([[:space:]]|$) ]] && return 0
      ;;
    node_modules/.bin/tsc)
      [[ "$words" =~ [[:space:]]--noEmit[[:space:]] ]] && return 0
      block "tsc without --noEmit writes build output; use 'node_modules/.bin/tsc -p <pkg> --noEmit'."
      ;;
    node_modules/.bin/vitest)
      [[ "$words" =~ [[:space:]](-u|--update)[[:space:]] ]] &&
        block "vitest ${BASH_REMATCH[1]} rewrites snapshots; the reviewer is read-only."
      [[ "$seg" =~ ^node_modules/\.bin/vitest[[:space:]]+run([[:space:]]|$) ]] && return 0
      ;;
    pnpm)
      [[ "$seg" =~ ^pnpm[[:space:]]+(lint|typecheck|test)([[:space:]]|$) ]] && return 0
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
  reviewer) guard_reviewer ;;
  *) warn "unknown role '$role'; allowing" ;;
esac
exit 0
