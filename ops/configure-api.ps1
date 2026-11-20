$ErrorActionPreference = 'Stop'
gcloud run services update mirai-api --project mirai-514723 --region us-east4 --max=1 --timeout=300s
exit $LASTEXITCODE
