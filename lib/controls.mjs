export function canGenerate({paused, topicStatus, authenticated, budgetRemaining, canonicalConnected}) {
  if (!authenticated) return {ok:false,reason:"unauthenticated"};
  if (paused) return {ok:false,reason:"paused"};
  if (topicStatus !== "active") return {ok:false,reason:"topic-inactive"};
  if (!canonicalConnected) return {ok:false,reason:"canonical-room-unavailable"};
  if (!Number.isSafeInteger(budgetRemaining) || budgetRemaining < 1) return {ok:false,reason:"budget-exhausted"};
  return {ok:true};
}
export function chicagoHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"numeric",hour12:false}).formatToParts(date);
  return Number(parts.find(x=>x.type==="hour").value) % 24;
}
export function isDiscussionWindow(date = new Date()) {const h=chicagoHour(date);return h>=12 && h<14;}
