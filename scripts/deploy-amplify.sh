#!/usr/bin/env bash
# Publica dist/saludflex-gabinete/browser en la app Amplify «saludflex-gabinete»
# (deploy manual, mismo patron que sira-front). Lo usa el CI tras pasar build y
# pruebas; sirve igual a mano con credenciales de AWS. Falla si Amplify no
# termina en SUCCEED.
set -euo pipefail

APP_ID="${AMPLIFY_APP_ID:?falta AMPLIFY_APP_ID}"
BRANCH="${AMPLIFY_BRANCH:-main}"
REGION="${AWS_REGION:-us-east-1}"
DIST="dist/saludflex-gabinete/browser"
POLL_SECONDS=10
MAX_POLLS=60

test -f "$DIST/index.html" || { echo "No hay build en $DIST"; exit 1; }

ZIP="$(mktemp -d)/saludflex-gabinete-dist.zip"
(cd "$DIST" && zip -qr "$ZIP" .)

DEPLOYMENT="$(aws amplify create-deployment --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --output json)"
JOB_ID="$(echo "$DEPLOYMENT" | jq -r .jobId)"
UPLOAD_URL="$(echo "$DEPLOYMENT" | jq -r .zipUploadUrl)"

curl --fail --silent --show-error -X PUT -T "$ZIP" "$UPLOAD_URL"
aws amplify start-deployment --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
echo "Deploy $JOB_ID iniciado"

for _ in $(seq 1 "$MAX_POLLS"); do
  STATUS="$(aws amplify get-job --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --query 'job.summary.status' --output text)"
  case "$STATUS" in
    SUCCEED) echo "Deploy $JOB_ID publicado"; exit 0 ;;
    FAILED | CANCELLED) echo "Deploy $JOB_ID termino en $STATUS"; exit 1 ;;
  esac
  sleep "$POLL_SECONDS"
done

echo "Deploy $JOB_ID no termino a tiempo (ultimo estado: $STATUS)"
exit 1
