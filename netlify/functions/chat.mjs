// Intentionally fail closed: no public, unauthenticated paid inference endpoint.
export default async () => Response.json({ error: "AI chat is not enabled. Authentication, shared-room persistence, and usage controls must be configured first." }, { status: 503 });
export const config = { path: "/api/chat", method: "POST" };
