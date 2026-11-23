export default async () => Response.json({ service: "deans-think-tank-ai", status: "setup", aiEnabled: false });
export const config = { path: "/api/health", method: "GET" };
