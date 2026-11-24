export function aiConfiguration(env = process.env) {
  const provider = Boolean(env.OPENAI_BASE_URL && env.OPENAI_API_KEY);
  const gateway = Boolean(env.NETLIFY_AI_GATEWAY_URL && env.NETLIFY_AI_GATEWAY_KEY);
  const model = env.TANK_AI_MODEL || 'gpt-6.1-sol';
  const dailyCallLimit = Number(env.TANK_DAILY_CALL_LIMIT || '30');
  const ready = (provider || gateway) && Number.isSafeInteger(dailyCallLimit) && dailyCallLimit > 0 && dailyCallLimit <= 30;
  return { ready, model, dailyCallLimit, message: ready ? 'Live replies connected' : 'Live replies unavailable; scheduled writers’ room sessions and saved messages remain available.' };
}
