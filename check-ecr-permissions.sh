#!/bin/bash

ROLE_NAME="nhit-ecs-execution-role"

echo "Checking policies for $ROLE_NAME..."
echo ""

echo "=== Managed Policies ==="
aws iam list-attached-role-policies --role-name "$ROLE_NAME" --region ap-south-1

echo ""
echo "=== Inline Policies ==="
aws iam list-role-policies --role-name "$ROLE_NAME" --region ap-south-1

echo ""
echo "The execution role MUST have these permissions:"
echo "  - ecr:GetAuthorizationToken"
echo "  - ecr:BatchCheckLayerAvailability"
echo "  - ecr:GetDownloadUrlForLayer"
echo "  - ecr:BatchGetImage"
echo "  - logs:CreateLogStream"
echo "  - logs:PutLogEvents"
echo "  - secretsmanager:GetSecretValue"
echo "  - kms:Decrypt"
