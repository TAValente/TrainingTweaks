# Operations

## Strava Webhook Processor Automation

Scheduled automation must call only the server-to-server webhook processor:

```text
POST /api/strava/webhook/process?limit=25
```

It must not call cookie-authenticated user routes such as `/api/strava/refresh` or `/api/state`. A response like `{"error":"Login required."}` means the request hit the cookie-auth proxy instead of the webhook processor boundary.

Required GitHub and Vercel settings:

- GitHub repository variable `TRAININGTWEAKS_APP_URL`: deployed app origin only, for example `https://<production-domain>`. Do not include a path, query string, or hash.
- GitHub repository secret `STRAVA_WEBHOOK_PROCESS_SECRET`: must match Vercel env var `STRAVA_WEBHOOK_PROCESS_SECRET`.
- GitHub repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`: must match the Vercel automation bypass secret when deployment protection is enabled.
