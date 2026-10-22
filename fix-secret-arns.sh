#!/bin/bash

echo "Getting the full secret ARN..."
FULL_SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id nhit-backend-env-bE24zy \
  --region ap-south-1 \
  --query 'ARN' \
  --output text)

echo "Full secret ARN: $FULL_SECRET_ARN"
echo ""

if [[ -z "$FULL_SECRET_ARN" ]]; then
  echo "Error: Could not find secret!"
  exit 1
fi

echo "The correct format for secrets in ECS task definition should be:"
echo "$FULL_SECRET_ARN:KEY_NAME::"
echo ""
echo "Example for MYSQL_HOST:"
echo "$FULL_SECRET_ARN:MYSQL_HOST::"
echo ""

echo "Now downloading and fixing the task definition..."

# Download current task definition
aws ecs describe-task-definition \
  --task-definition nhit-task \
  --region ap-south-1 \
  --query taskDefinition > task-def-raw.json

# The WRONG ARN in the task definition (with typo)
WRONG_ARN="arn:aws:secretsmanager:ap-south-1:529906093872:secret:nhit-backend-env-bEZ4zy"

echo "Replacing WRONG ARN: $WRONG_ARN"
echo "With CORRECT ARN: $FULL_SECRET_ARN"
echo ""

# Fix the secret ARNs
jq --arg WRONG "$WRONG_ARN" --arg CORRECT "$FULL_SECRET_ARN" '
  .containerDefinitions[0].secrets |= map(
    .valueFrom |= gsub($WRONG; $CORRECT)
  ) |
  del(.compatibilities, .taskDefinitionArn, .requiresAttributes, .revision, .status, .registeredAt, .registeredBy, .enableFaultInjection, .deregisteredAt)
' task-def-raw.json > task-def-fixed.json

echo ""
echo "Secrets count: $(jq '.containerDefinitions[0].secrets | length' task-def-fixed.json)"
echo ""
echo "Sample secret ARN (should have bE24zy, not bEZ4zy):"
jq -r '.containerDefinitions[0].secrets[0].valueFrom' task-def-fixed.json
echo ""

read -p "Register this fixed task definition? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  aws ecs register-task-definition \
    --cli-input-json file://task-def-fixed.json \
    --region ap-south-1
  
  echo ""
  echo "✅ New task definition registered!"
  echo ""
  echo "Now update the service:"
  echo "aws ecs update-service --cluster nhit-cluster --service nhit-task-service-ep26xxoo --task-definition nhit-task --force-new-deployment --region ap-south-1"
fi
