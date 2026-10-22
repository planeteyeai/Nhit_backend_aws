#!/bin/bash

echo "Checking ECS Task Execution Role permissions..."
echo ""

# Get the task definition to find the execution role
TASK_DEF=$(aws ecs describe-task-definition --task-definition nhit-task --region ap-south-1)

EXECUTION_ROLE_ARN=$(echo "$TASK_DEF" | jq -r '.taskDefinition.executionRoleArn')

echo "Task Execution Role ARN: $EXECUTION_ROLE_ARN"
echo ""

# Extract role name from ARN
ROLE_NAME=$(echo "$EXECUTION_ROLE_ARN" | awk -F'/' '{print $NF}')

echo "Role Name: $ROLE_NAME"
echo ""

# List attached policies
echo "=== Attached Managed Policies ==="
aws iam list-attached-role-policies --role-name "$ROLE_NAME" --region ap-south-1

echo ""
echo "=== Inline Policies ==="
aws iam list-role-policies --role-name "$ROLE_NAME" --region ap-south-1

echo ""
echo "=== Checking for Secrets Manager permissions ==="
aws iam list-attached-role-policies --role-name "$ROLE_NAME" --region ap-south-1 | grep -i secret || echo "No managed policy with 'secret' in name found"

echo ""
echo "To fix this, the execution role needs this policy:"
echo ""
cat << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ],
      "Resource": [
        "arn:aws:secretsmanager:ap-south-1:529906093872:secret:nhit-backend-env-bEZ4zy-*",
        "arn:aws:kms:ap-south-1:529906093872:key/*"
      ]
    }
  ]
}
EOF
