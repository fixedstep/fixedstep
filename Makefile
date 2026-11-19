# Host-side shortcuts for the sandboxed dev container (see .devcontainer/README.md).
#   make claude                      Claude Code in the container (starts it first if needed)
#   make claude ARGS="--continue"    extra arguments go to Claude
#   make shell                       zsh in the container (starts it first if needed)
#   make up | stop | down | rebuild | rebuild-clean

DC := .devcontainer/devcontainer.sh

.PHONY: help claude shell up stop down rebuild rebuild-clean

help:
	@sed -n '2,5p' Makefile

claude:
	@$(DC) claude $(ARGS)

shell:
	@$(DC) up >/dev/null
	@$(DC) shell

up stop down rebuild rebuild-clean:
	@$(DC) $@
