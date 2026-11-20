$ErrorActionPreference = 'Stop'
gcloud run services update mirai-api --project mirai-514723 --region us-east4 --timeout=3600s
exit $LASTEXITCODE
