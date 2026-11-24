import { getUser } from '@netlify/identity';
export const OWNER = 'jkizermear@gmail.com';
export async function ownerUser(context) {
  // Netlify verifies context.user for the private project perimeter. Identity
  // remains a fallback for an existing app session; never trust identity headers.
  const user = context?.user || await getUser().catch(() => null);
  return user?.email?.toLowerCase() === OWNER ? user : null;
}
export function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
