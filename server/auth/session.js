import { fromNodeHeaders } from 'better-auth/node';

export function getAuthSession({ auth, request }) {
  return auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  });
}
