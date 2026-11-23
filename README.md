# Dean’s Think Tank AI backend

Netlify-hosted backend for the existing Think Tank. This initial deployment is a safe foundation, **not** a functioning AI chat service.

## Endpoints
- `GET /api/health`: setup status, no model calls.
- `POST /api/chat`: intentionally disabled (503) until authenticated access, canonical room storage, and atomic usage quotas are implemented.

## Next steps
1. Link this GitHub repository to the existing Netlify project `deans-think-tank-ai` and deploy.
2. Configure authenticated, server-side access to the existing canonical Think Tank room without copying secrets into GitHub.
3. Implement idempotent transcript writes, role-based controls, and persistent atomic budgets.
4. Add Netlify AI Gateway inference using server-side provider SDK and current model availability.
5. Add scheduled discussion sessions and robust daylight-saving-time handling for America/Chicago.
6. Test message delivery, genuine AI contributions, pause controls, and spending limits.

**Security:** Never store API keys or private transcripts in this repository. Do not expose unauthenticated AI calls. No additional purchases are authorized.
