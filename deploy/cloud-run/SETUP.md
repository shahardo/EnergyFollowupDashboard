# Hosting on Google Cloud Run (free tier)

The whole app (the dashboard, the Python API and the OSeMOSYS solver) runs as one Cloud Run service built from the
repo's `Dockerfile`. The service has 1 vCPU and 2 GiB: a full OSeMOSYS solve takes about 20–30 s and under 1 GB there.
GitHub Pages keeps serving the static dashboard; it can call this server too (step 7).

How it behaves:

- **Scales to zero.** With no visitors no instance runs and nothing is billed. The first request after a pause waits
  for a cold start (about 10–20 s); the dashboard's server check waits for it.
- **One instance at most** (`--max-instances 1`): one state folder and one run queue.
- **The solve runs inside the request.** With `RUN_IN_REQUEST=1` the "run" request stays open until the solve ends.
  Cloud Run throttles the CPU when no request is in flight, so a background solve would stall. The optimisation tab
  shows the status, log and cancel button meanwhile, as before.
- **The disk is in memory and is wiped** when the instance stops. Saved scenarios and run results survive in a
  **Google Cloud Storage bucket** (free tier; step 3):
  - restored on start;
  - pushed every 5 minutes when something changed;
  - pushed right after each run;
  - pushed on shutdown.
- **Cost.** The free tier (in us-central1, us-east1 or us-west1) covers this use many times over, but Cloud Run needs a
  billing account. The step 1 budget alert tells you if anything is ever charged. Image storage in Artifact Registry is
  kept under its free 0.5 GB by a cleanup policy (step 6).

The commands below use the `gcloud` CLI ([install](https://cloud.google.com/sdk/docs/install), or use Cloud Shell in the
console). Replace `PROJECT_ID`, `PROJECT_NUMBER` and `<github-user>` throughout.

## 1. Project, billing and a budget alert

1. In the [console](https://console.cloud.google.com/): **New project** (e.g. `energy-dashboard`). Note its **project
   ID** and **project number**.
2. **Billing → Link a billing account** (a card is required, but the free tier applies).
3. **Billing → Budgets & alerts → Create budget**: amount **$1**, alerts at 50% / 100%, to your email.

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com
```

## 2. A deploy identity for GitHub (no keys)

The deploy runs from GitHub Actions as a service account. GitHub authenticates with Workload Identity Federation, so no
long-lived key is stored anywhere.

```bash
gcloud iam service-accounts create deployer --display-name "GitHub deploy"
SA=deployer@PROJECT_ID.iam.gserviceaccount.com
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.admin \
            roles/storage.admin roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding PROJECT_ID --member "serviceAccount:$SA" --role "$role"
done

gcloud iam workload-identity-pools create github --location global
gcloud iam workload-identity-pools providers create-oidc github --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository == '<github-user>/EnergyFollowupDashboard'"
gcloud iam service-accounts add-iam-policy-binding $SA --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/<github-user>/EnergyFollowupDashboard"
```

The service itself runs as the project's default compute service account:

```bash
RUNTIME=PROJECT_NUMBER-compute@developer.gserviceaccount.com
```

## 3. The state bucket (Google Cloud Storage, free tier)

```bash
gcloud services enable storage.googleapis.com
BUCKET=energy-dashboard-state-PROJECT_ID  # bucket names are global, so make it unique
gcloud storage buckets create gs://$BUCKET --location us-central1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member "serviceAccount:$RUNTIME" --role roles/storage.objectAdmin
```

No token needed: the service authenticates as `$RUNTIME` automatically on Cloud Run. Without a bucket the app still
works, but saved scenarios and runs are lost whenever the instance stops.

## 4. The run-token secret (Google Secret Manager)

```bash
printf '%s' '<any passphrase>' | gcloud secrets create run-token --data-file=-
gcloud secrets add-iam-policy-binding run-token \
  --member "serviceAccount:$RUNTIME" --role roles/secretmanager.secretAccessor
```

`run-token` is the passphrase for starting a solve and for saving or deleting on the server. You enter it once in the ⚙
dialog or on the optimisation tab, and it is kept in that browser. Viewing stays open. Keep it: the service is public,
and without it anyone could use your free CPU quota.

## 5. GitHub settings (repo → Settings → Secrets and variables → Actions → Variables)

| Variable | Value |
|---|---|
| `GCP_PROJECT` | `PROJECT_ID` |
| `GCP_REGION` | optional, default `us-central1` |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `deployer@PROJECT_ID.iam.gserviceaccount.com` |
| `STATE_BUCKET` | the bucket name from step 3 |

From then on every push to `main` that passes CI deploys (`.github/workflows/deploy-cloud-run.yml`). You can also run
it by hand: **Actions → Deploy to Google Cloud Run → Run workflow**. The run's summary shows the service URL. Without
`GCP_PROJECT` the workflow skips.

To deploy from your own machine instead, run the same `gcloud run deploy … --source .` command as the workflow, from the
repo root.

## 6. Keep image storage free

Each deploy stores an image (about 1 GB uncompressed, less stored) in the `cloud-run-source-deploy` repository that
the first deploy creates. Keep only the last two:

```bash
cat > /tmp/policy.json <<'JSON'
[{"name": "keep-2", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
 {"name": "delete-rest", "action": {"type": "Delete"}, "condition": {"tagState": "ANY"}}]
JSON
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --location us-central1 \
  --policy /tmp/policy.json --no-dry-run
```

## 7. Check, and connect the GitHub Pages copy

Open the service URL. The app should show the tab **"אופטימיזציה (OSeMOSYS)"**, which appears only when the API answers.
`<url>/api/health` should report `"stateMirror": true` and `"tokenRequired": true`.

To give the GitHub Pages copy the server features too, add the repo variable **`API_URL`** = the service URL. The next
Pages build calls it. The server already allows `https://<github-user>.github.io` (`CORS_ORIGINS`, default includes
`https://shahardo.github.io`). For a different Pages origin, add `--update-env-vars CORS_ORIGINS=…` to the deploy.

Optional settings (add them to `--set-env-vars` in the workflow): `RUN_TIME_LIMIT` (seconds per solve, default 1800)
and `SYNC_EVERY` (seconds between state pushes, default 300).
