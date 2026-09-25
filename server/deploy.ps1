#!/usr/bin/env pwsh
# ──────────────────────────────────────────────────────────────────────────────
# deploy.ps1 — One-command deploy of Sentinel backend to Google Cloud Run
#
# Prerequisites (run once):
#   1. Install Google Cloud SDK:  https://cloud.google.com/sdk/docs/install
#   2. Run: gcloud auth login
#   3. Run: gcloud auth configure-docker
#
# Usage:
#   cd server
#   .\deploy.ps1 -Project YOUR_GCP_PROJECT_ID
# ──────────────────────────────────────────────────────────────────────────────
param(
    [Parameter(Mandatory=$true)]
    [string]$Project,
    [string]$Region   = "asia-south1",   # Mumbai — closest to India
    [string]$Service  = "sentinel-backend",
    [string]$Image    = "gcr.io/$Project/sentinel-backend"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Sentinel Backend — Cloud Run Deploy ===" -ForegroundColor Cyan
Write-Host "  Project : $Project"
Write-Host "  Region  : $Region"
Write-Host "  Service : $Service"
Write-Host "  Image   : $Image`n"

# ── 1. Set the active GCP project ────────────────────────────────────────────
Write-Host "[1/5] Setting GCP project..." -ForegroundColor Yellow
gcloud config set project $Project

# ── 2. Enable required APIs (idempotent) ─────────────────────────────────────
Write-Host "[2/5] Enabling Cloud Run + Container Registry APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com containerregistry.googleapis.com

# ── 3. Build & push the Docker image via Cloud Build (no local Docker needed) ─
Write-Host "[3/5] Building image with Cloud Build..." -ForegroundColor Yellow
gcloud builds submit . --tag $Image

# ── 4. Deploy to Cloud Run ────────────────────────────────────────────────────
Write-Host "[4/5] Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $Service `
  --image $Image `
  --platform managed `
  --region $Region `
  --allow-unauthenticated `
  --port 8080 `
  --memory 512Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 5 `
  --set-env-vars "PORT=8080,FRONTEND_URL=*,MONGO_URI=" `
  --timeout 300

# ── 5. Print the deployed URL ─────────────────────────────────────────────────
Write-Host "`n[5/5] Fetching service URL..." -ForegroundColor Yellow
$url = gcloud run services describe $Service --region $Region --format "value(status.url)"
Write-Host "`n✅ Deployed successfully!" -ForegroundColor Green
Write-Host "   Backend URL : $url" -ForegroundColor Green
Write-Host "   Health check: $url/api/health" -ForegroundColor Green
Write-Host "   API docs    : $url/docs`n" -ForegroundColor Green
Write-Host "👉 Update your frontend VITE_BACKEND_URL = $url" -ForegroundColor Cyan
