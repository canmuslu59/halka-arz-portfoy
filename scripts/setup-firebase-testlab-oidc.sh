#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="halka-arz-portfoyum-d86ff"
PROJECT_NUMBER="181104463772"
REPOSITORY="canmuslu59/halka-arz-portfoy"
POOL_ID="github-actions"
PROVIDER_ID="github"
SERVICE_ACCOUNT_NAME="github-testlab"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RESULTS_BUCKET="gs://halka-arz-testlab-results-${PROJECT_NUMBER}"

echo "Using project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

echo "Enabling required APIs..."
gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  testing.googleapis.com \
  toolresults.googleapis.com \
  --project "${PROJECT_ID}"

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating service account: ${SERVICE_ACCOUNT_EMAIL}"
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --project "${PROJECT_ID}" \
    --display-name "GitHub Firebase Test Lab"
fi

# Use a dedicated results bucket so the CI principal does not need the broad Editor role.
if ! gcloud storage buckets describe "${RESULTS_BUCKET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating dedicated Test Lab results bucket: ${RESULTS_BUCKET}"
  gcloud storage buckets create "${RESULTS_BUCKET}" \
    --project "${PROJECT_ID}" \
    --location "europe-west1" \
    --uniform-bucket-level-access
fi

for ROLE in roles/cloudtestservice.testAdmin roles/firebase.analyticsViewer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role "${ROLE}" \
    --condition=None >/dev/null
done

gcloud storage buckets add-iam-policy-binding "${RESULTS_BUCKET}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/storage.objectAdmin" >/dev/null

if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project "${PROJECT_ID}" --location global >/dev/null 2>&1; then
  echo "Creating Workload Identity Pool..."
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project "${PROJECT_ID}" \
    --location global \
    --display-name "GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project "${PROJECT_ID}" \
  --location global \
  --workload-identity-pool "${POOL_ID}" >/dev/null 2>&1; then
  echo "Creating GitHub OIDC provider..."
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project "${PROJECT_ID}" \
    --location global \
    --workload-identity-pool "${POOL_ID}" \
    --display-name "GitHub ${REPOSITORY}" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.actor=assertion.actor" \
    --attribute-condition "assertion.repository=='${REPOSITORY}'"
fi

MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPOSITORY}"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project "${PROJECT_ID}" \
  --role "roles/iam.workloadIdentityUser" \
  --member "${MEMBER}" >/dev/null

PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project "${PROJECT_ID}" \
  --location global \
  --workload-identity-pool "${POOL_ID}" \
  --format='value(name)')"

echo
echo "SETUP_COMPLETE"
echo "Create these two GitHub repository variables:"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_NAME}"
echo "GCP_TESTLAB_SERVICE_ACCOUNT=${SERVICE_ACCOUNT_EMAIL}"
echo "GCP_TESTLAB_RESULTS_BUCKET=${RESULTS_BUCKET}"
echo
echo "No JSON private key was created and no project Editor role was granted."
