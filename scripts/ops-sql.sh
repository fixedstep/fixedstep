#!/usr/bin/env bash
# Run one SQL statement against an AWS stage's database through its ops task (a psql container on
# the API's network; the database has no route out). Waits for the task, then prints its log.
# Needs the stage's AWS credentials (README "AWS setup", step 1), pulumi and jq.
#   AWS_PROFILE=fixedstep-staging scripts/ops-sql.sh aws-staging 'SELECT count(*) FROM "user";'
set -euo pipefail
cd "$(dirname "$0")/.."
STACK=$1 SQL=$2
# The organization's SCP allows workloads only in us-east-2.
export AWS_REGION=${AWS_REGION:-us-east-2}
OPS=$(cd infra && pulumi stack output ops -s "$STACK" --json)
CLUSTER=$(jq -r .cluster <<<"$OPS")
# The SQL goes in as an env var, so it needs no shell quoting inside the container command.
CMD='psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$SQL"'
ARN=$(aws ecs run-task --launch-type FARGATE \
  --cluster "$CLUSTER" \
  --task-definition "$(jq -r .taskDefinition <<<"$OPS")" \
  --network-configuration "$(jq -r .networkConfiguration <<<"$OPS")" \
  --overrides "$(jq -n --arg cmd "$CMD" --arg sql "$SQL" \
    '{containerOverrides: [{name: "ops", command: ["sh", "-c", $cmd], environment: [{name: "SQL", value: $sql}]}]}')" \
  --query 'tasks[0].taskArn' --output text)
echo "Started $ARN; waiting for it to stop (about a minute)..."
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$ARN"
aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" \
  --query 'tasks[0].{stop:stoppedReason,exit:containers[0].exitCode}' --output text
aws logs get-log-events --log-group-name "$(jq -r .logGroup <<<"$OPS")" \
  --log-stream-name "ops/ops/${ARN##*/}" --query 'events[].message' --output text
