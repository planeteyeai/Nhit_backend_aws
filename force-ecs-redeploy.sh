#!/bin/bash

echo "Forcing ECS service to redeploy with new IAM permissions..."

aws ecs update-service \
  --cluster nhit-cluster \
  --service nhit-task-service-ep26xxoo \
  --force-new-deployment \
  --region ap-south-1

echo ""
echo "Deployment triggered! The service will:"
echo "1. Stop old tasks"
echo "2. Start new tasks with proper IAM permissions"
echo "3. New tasks will be able to read secrets from Secrets Manager"
echo ""
echo "Check deployment status:"
echo "https://console.aws.amazon.com/ecs/home?region=ap-south-1#/clusters/nhit-cluster/services/nhit-task-service-ep26xxoo/events"
echo ""
echo "Check logs in ~2 minutes:"
echo "https://console.aws.amazon.com/cloudwatch/home?region=ap-south-1#logsV2:log-groups/log-group/%2Fecs%2Fnhit-backend"
