#!/bin/bash
# Script to add Secrets Manager read permission to ECS execution role

set -e

ROLE_NAME="nhit-ecs-execution-role"
POLICY_NAME="SecretsManagerReadNhitBackend"
SECRET_ARN="arn:aws:secretsmanager:ap-south-1:529906093872:secret:nhit-backend-env-bE24zy"
REGION="ap-south-1"

echo "Adding inline policy to IAM role: $ROLE_NAME"
echo "Secret ARN: $SECRET_ARN"

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "secretsmanager:GetSecretValue"
        ],
        "Resource": "'"$SECRET_ARN"'"
      }
    ]
  }'

echo "✓ Policy added successfully!"
echo ""
echo "Now forcing new deployment of ECS service..."

aws ecs update-service \
  --cluster nhit-cluster \
  --service nhit-task-service-ep26xxoo \
  --region "$REGION" \
  --force-new-deployment

echo "✓ Service deployment started!"
echo ""
echo "Monitor the deployment:"
echo "aws ecs describe-services --cluster nhit-cluster --services nhit-task-service-ep26xxoo --region $REGION"
