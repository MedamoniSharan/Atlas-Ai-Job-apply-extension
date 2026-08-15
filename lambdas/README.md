# Cosmo AWS Lambdas (API Gateway + DynamoDB)

Paste-ready **Python 3.14** handlers (`python3.14` runtime) in the Devfolio style.
Each folder is one Lambda: `Handler: lambda_function.lambda_handler`.

In the Lambda console, create every function with **Runtime → Python 3.14**.

Runtime needs only the **AWS SDK (boto3)** which is built into Lambda for most functions.
JWT (HS256) and passwords (PBKDF2) use the Python stdlib — no PyJWT/bcrypt layer required.

**Exception — `cosmo-billing`:** invoice PDFs use **ReportLab**. This function runs on
**Python 3.12** (ReportLab wheels). Package deps into the deployment zip (or attach a layer):

```bash
cd lambdas/cosmo-billing
pip install -r requirements.txt -t package \
  --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12
cp lambda_function.py invoice_pdf.py package/
cp -R fonts package/
cd package && zip -r ../cosmo-billing.zip .
```

Then upload `cosmo-billing.zip` as the function code.

## DynamoDB tables

Create these in **Asia Pacific (Hyderabad) `ap-south-2`** (on-demand billing is fine).

| Table | PK | SK | GSIs |
|-------|----|----|------|
| `CosmoUsers` | `email` (S) | — | `UserIdIndex` PK=`userId`; `GoogleIdIndex` PK=`googleId` |
| `CosmoApplications` | `userId` (S) | `eventId` (S) | `AppIdIndex` PK=`applicationId`; `ExternalJobIndex` PK=`userId` SK=`platformExternalJobId`; `UserCreatedIndex` PK=`userId` SK=`createdAt` |
| `CosmoActivities` | `userId` (S) | `eventId` (S) | — |
| `CosmoScanSessions` | `userId` (S) | `sessionId` (S) | `UserStartedIndex` PK=`userId` SK=`startedAt` |
| `CosmoPayments` | `paymentId` (S) | — | `UserPaymentsIndex` PK=`userId` SK=`createdAt`; `InvoiceNumberIndex` PK=`invoiceNumber` |
| `CosmoSubscriptions` | `subscriptionId` (S) | — | `UserSubsIndex` PK=`userId` SK=`createdAt`; `RazorpaySubIndex` PK=`razorpaySubscriptionId` |
| `CosmoPlanConfigs` | `tier` (S) | — | — |
| `CosmoSiteOffers` | `offerId` (S) | — | — |
| `CosmoSiteBanners` | `bannerId` (S) | — | — |
| `CosmoCoupons` | `code` (S) | — | — |
| `CosmoCouponRedemptions` | `code` (S) | `redemptionSk` (S, `{userId}#{paymentId}`) | — |
| `CosmoAdminAudit` | `auditId` (S) | — | `CreatedAtIndex` PK=`entityType` SK=`createdAt` |
| `CosmoUninstallFeedback` | `feedbackId` (S) | — | `CreatedAtIndex` PK=`entityType` SK=`createdAt` |
| `CosmoApplyCounters` | `userId` (S) | `periodKey` (S) | — |

`periodKey` format (IST): `day#YYYY-MM-DD`, `month#YYYY-MM`, `hour#YYYY-MM-DDTHH` (hour optional; used by billing/me).

S3 bucket: `cosmo-invoices-290917471042` in `ap-south-2` (private; Lambdas use presigned GET URLs).
Env var: `INVOICES_BUCKET=cosmo-invoices-290917471042`.

Lambda execution role (existing): `AllowFullAccessS3DynamoLamdaApiGateway`.

## IAM

Each Lambda role needs:

- `dynamodb:GetItem|PutItem|UpdateItem|DeleteItem|Query|Scan|BatchWriteItem` on the tables above
- `s3:PutObject|GetObject` on `cosmo-invoices/*` (billing + admin invoice)
- CloudWatch Logs

## Environment variables (shared)

| Var | Used by |
|-----|---------|
| `JWT_ACCESS_SECRET` | auth, all protected routes |
| `JWT_REFRESH_SECRET` | auth |
| `JWT_ACCESS_EXPIRES_IN` | auth (seconds, default `900`) |
| `JWT_REFRESH_EXPIRES_IN` | auth (seconds, default `604800`) |
| `ADMIN_EMAILS` | auth (comma-separated) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | auth |
| `CORS_ORIGINS` | all (comma-separated exact origins; include `chrome-extension://<id>`) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | billing |
| `INVOICES_BUCKET` | billing (default `cosmo-invoices`) |
| Table name overrides | optional `USERS_TABLE`, `APPLICATIONS_TABLE`, `SITE_OFFERS_TABLE`, `SITE_BANNERS_TABLE`, `COUPONS_TABLE`, `COUPON_REDEMPTIONS_TABLE`, etc. |

## API Gateway (HTTP API) — live

- **Name:** `cosmo-api`
- **Region:** `ap-south-2`
- **Endpoint:** `https://shjisr6492.execute-api.ap-south-2.amazonaws.com`
- **Stage:** `$default` (auto-deploy)

Route map (ANY → Lambda proxy):

| Method | Path | Lambda |
|--------|------|--------|
| ANY | `/health` | cosmo-health |
| ANY | `/api/v1/health` | cosmo-health |
| ANY | `/api/v1/health/{proxy+}` | cosmo-health |
| ANY | `/api/v1/auth/{proxy+}` | cosmo-auth |
| ANY | `/api/v1/preferences` | cosmo-preferences |
| ANY | `/api/v1/preferences/{proxy+}` | cosmo-preferences |
| ANY | `/api/v1/onboarding/{proxy+}` | cosmo-preferences |
| ANY | `/api/v1/events/{proxy+}` | cosmo-events |
| ANY | `/api/v1/applications` | cosmo-applications |
| ANY | `/api/v1/applications/{proxy+}` | cosmo-applications |
| ANY | `/api/v1/companies` | cosmo-companies |
| ANY | `/api/v1/companies/{proxy+}` | cosmo-companies |
| ANY | `/api/v1/scan-sessions` | cosmo-scan-sessions |
| ANY | `/api/v1/scan-sessions/{proxy+}` | cosmo-scan-sessions |
| ANY | `/api/v1/billing/{proxy+}` | cosmo-billing |
| ANY | `/api/v1/feedback/{proxy+}` | cosmo-feedback |
| ANY | `/api/v1/leaderboard` | cosmo-leaderboard |
| ANY | `/api/v1/leaderboard/{proxy+}` | cosmo-leaderboard |
| ANY | `/api/v1/admin/{proxy+}` | cosmo-admin |

Enable CORS on the API for your web origin(s) and extension ID.  
For `POST /api/v1/billing/webhooks/razorpay`, pass the **raw body** (API Gateway HTTP API does this by default as a string; if `isBase64Encoded`, the Lambda decodes it).

## Data migration (Mongo → DynamoDB)

```bash
set -a && source .env && set +a
export AWS_DEFAULT_REGION=ap-south-2
export INVOICES_BUCKET=cosmo-invoices-290917471042
python3 scripts/migrate_mongo_to_dynamo.py --dry-run
python3 scripts/migrate_mongo_to_dynamo.py --full
python3 scripts/migrate_mongo_to_dynamo.py --verify
```

Preserves Mongo `_id` hex as `userId` / FKs. Rebuilds `CosmoApplyCounters`. Uploads local invoice PDFs to S3 when present.

1. Create DynamoDB tables + S3 bucket + IAM role.
2. Create Lambda `cosmo-auth` (**Python 3.14**), paste `cosmo-auth/lambda_function.py`, set env vars, attach role.
3. Repeat for each folder under `lambdas/` (always choose **Python 3.14**).
4. Wire API Gateway routes above.
5. Seed plans: invoke cosmo-billing with `{ "action": "seedPlans" }` from the test console (or first `GET /billing/me` seeds defaults).
6. Point client `VITE_API_BASE` and extension `PRODUCTION_API_BASE` at the API Gateway URL.
7. Update Razorpay webhook URL to `https://<api>/api/v1/billing/webhooks/razorpay`.

## Response envelope

Matches `@cosmo/shared`:

```json
{ "success": true, "message": "...", "data": {}, "error": null }
```

Errors:

```json
{ "success": false, "message": "...", "data": null, "error": { "code": "..." } }
```
