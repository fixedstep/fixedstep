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
if [[ $ARN != arn:* ]]; then
  echo "run-task started no task (capacity or config failure); see the AWS console" >&2
  exit 1
fi
echo "Started $ARN; waiting for it to stop (about a minute)..."
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$ARN"
read -r EXIT STOP < <(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" \
  --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)
# Log delivery can trail the stop by a few seconds; re-run just this call if it comes back empty.
aws logs get-log-events --log-group-name "$(jq -r .logGroup <<<"$OPS")" \
  --log-stream-name "ops/ops/${ARN##*/}" --query 'events[].message' --output json | jq -r '.[]'
if [[ $EXIT != 0 ]]; then
  echo "Task failed: exit $EXIT ($STOP)" >&2
  exit 1
fi
