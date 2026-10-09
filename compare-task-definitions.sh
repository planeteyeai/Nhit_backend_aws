#!/bin/bash

echo "Fetching latest task definition revisions..."
echo ""

# Get the two latest revisions
REV1=$(aws ecs list-task-definitions --family-prefix nhit-task --sort DESC --max-items 1 --region ap-south-1 --query 'taskDefinitionArns[0]' --output text)
REV2=$(aws ecs list-task-definitions --family-prefix nhit-task --sort DESC --max-items 2 --region ap-south-1 --query 'taskDefinitionArns[1]' --output text)

echo "Latest (from CI/CD): $REV1"
echo "Previous (manual):   $REV2"
echo ""

echo "=== Secrets in LATEST (CI/CD) ==="
aws ecs describe-task-definition --task-definition "$REV1" --region ap-south-1 --query 'taskDefinition.containerDefinitions[0].secrets' --output json | jq 'length'

echo ""
echo "=== Secrets in PREVIOUS (manual) ==="
aws ecs describe-task-definition --task-definition "$REV2" --region ap-south-1 --query 'taskDefinition.containerDefinitions[0].secrets' --output json | jq 'length'

echo ""
echo "=== Comparing image URIs ==="
echo "Latest:   $(aws ecs describe-task-definition --task-definition "$REV1" --region ap-south-1 --query 'taskDefinition.containerDefinitions[0].image' --output text)"
echo "Previous: $(aws ecs describe-task-definition --task-definition "$REV2" --region ap-south-1 --query 'taskDefinition.containerDefinitions[0].image' --output text)"

echo ""
echo "=== Full comparison of secrets ==="
echo "Writing to files for comparison..."
aws ecs describe-task-definition --task-definition "$REV1" --region ap-south-1 --query 'taskDefinition.containerDefinitions[0]' > latest-container-def.json
aws ecs describe-task-definition --task-definition "$REV2" --region ap-south-1 --query 'taskDefinition.containerDefinitions[0]' > previous-container-def.json

echo "Files created:"
echo "  - latest-container-def.json (from CI/CD)"
echo "  - previous-container-def.json (manual)"
echo ""
echo "Check if secrets differ:"
diff <(jq -S '.secrets' latest-container-def.json) <(jq -S '.secrets' previous-container-def.json) || echo "Secrets are different!"
