# AWS ECS Deployment - Missing Environment Variables Fix

## Problem
Your application logs show missing environment variables causing failures:
- Database connection refused (missing MYSQL_* variables)
- Authentication will fail (missing JWT_SECRET)
- CORS blocked (missing CORS_ORIGIN)

## Root Cause
The ECS task definition doesn't have environment variables/secrets configured.

## Solution Steps

### 1. Create/Update AWS Secrets Manager Secret

Go to AWS Console → Secrets Manager → Create or edit your secret:

**Secret Name:** `nhit-backend-env-BEzAzy` (or similar)

**Secret Type:** Other type of secret

**Key-Value Pairs:**
```json
{
  "MYSQL_HOST": "nhit-db.xxxxxxx.ap-south-1.rds.amazonaws.com",
  "MYSQL_USER": "admin",
  "MYSQL_PASSWORD": "your-db-password",
  "MYSQL_DATABASE": "nhit_db",
  "JWT_SECRET": "generate-a-32-character-random-string-here",
  "CORS_ORIGIN": "https://your-frontend-domain.com",
  "AWS_REGION": "ap-south-1",
  "S3_BUCKET": "your-bucket-name",
  "PUBLIC_API_URL": "https://nhit-alb-xxxxxxx.ap-south-1.elb.amazonaws.com"
}
```

### 2. Get Your Secret ARN

After creating the secret, copy the ARN. It looks like:
```
arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy-xxxxxx
```

### 3. Update ECS Task Definition

#### Option A: Using AWS Console (Easier)

1. Go to: **ECS → Task Definitions → nhit-task → Create new revision**
2. Scroll to **Container: nhit-backend**
3. Under **Environment variables**, add these as **Secrets** (ValueFrom):

| Name | Value From | Type |
|------|------------|------|
| MYSQL_HOST | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:MYSQL_HOST::` | Secret |
| MYSQL_USER | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:MYSQL_USER::` | Secret |
| MYSQL_PASSWORD | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:MYSQL_PASSWORD::` | Secret |
| MYSQL_DATABASE | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:MYSQL_DATABASE::` | Secret |
| JWT_SECRET | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:JWT_SECRET::` | Secret |
| CORS_ORIGIN | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:CORS_ORIGIN::` | Secret |
| AWS_REGION | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:AWS_REGION::` | Secret |
| S3_BUCKET | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:S3_BUCKET::` | Secret |
| PUBLIC_API_URL | `arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy:PUBLIC_API_URL::` | Secret |

4. Also add these as regular **Environment variables**:
   - `NODE_ENV` = `production`
   - `PORT` = `8080`
   - `HOST` = `0.0.0.0`
   - `MYSQL_PORT` = `3306`
   - `MYSQL_SSL` = `true`

5. Click **Create**
6. Update your service to use the new revision

#### Option B: Using AWS CLI

```bash
# Download current task definition
aws ecs describe-task-definition \
  --task-definition nhit-task \
  --query taskDefinition > current-task-def.json

# Edit the file to add secrets and environment variables
# (See aws-task-def-secrets-example.json for reference)

# Register new task definition
aws ecs register-task-definition \
  --cli-input-json file://updated-task-def.json

# Update service
aws ecs update-service \
  --cluster nhit-cluster \
  --service nhit-task-service-ep26xxoo \
  --task-definition nhit-task:NEW_REVISION_NUMBER
```

### 4. Verify Task Execution Role Has Permissions

Your task execution role needs permission to read from Secrets Manager.

The policy you showed in screenshot 3 looks correct:
```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "kms:Decrypt"
  ],
  "Resource": [
    "arn:aws:secretsmanager:ap-south-1:529990093872:secret:nhit-backend-env-BEzAzy-*",
    "arn:aws:kms:ap-south-1:529990093872:key/*"
  ]
}
```

Make sure this policy is attached to your **Task Execution Role** (not Task Role).

### 5. Deploy Again

After updating the task definition, the next GitHub Actions deployment will preserve all your secrets and just update the Docker image.

## Quick Test

After deployment, check logs again:
```bash
aws logs tail /ecs/nhit-backend --follow
```

You should see:
- ✅ "BMS backend bind http://0.0.0.0:8080 (production)"
- ✅ No warnings about missing env vars
- ✅ Database connections successful

## Generate Strong JWT Secret

Run this to generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Or:
```bash
openssl rand -base64 32
```

## Notes

- The GitHub Actions workflow already preserves secrets during deployment
- You only need to set up secrets in AWS once
- Future deployments will automatically use the secrets you configured
- Never commit real secrets to the repository
