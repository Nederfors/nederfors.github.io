/* global Request */
import { fromNodeHeaders } from 'better-auth/node';

function fetchBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.body == null) return undefined;
  if (typeof request.body === 'string' || request.body instanceof Uint8Array) return request.body;
  return JSON.stringify(request.body);
}

function setResponseHeaders(reply, response) {
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie' && name !== 'cache-control') reply.header(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  reply.header('cache-control', 'no-store');
}

export async function authRoutes(app, { auth, config }) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    exposeHeadRoute: false,
    onRequest(_request, reply, done) {
      reply.header('cache-control', 'no-store');
      done();
    },
    async handler(request, reply) {
      const headers = fromNodeHeaders(request.headers);
      headers.delete('content-length');
      const requestPath = request.raw.url.startsWith('/') ? request.raw.url : `/${request.raw.url}`;
      const response = await auth.handler(new Request(
        new URL(`${config.auth.baseUrl}${requestPath}`),
        {
          method: request.method,
          headers,
          body: fetchBody(request)
        }
      ));

      setResponseHeaders(reply, response);
      const body = Buffer.from(await response.arrayBuffer());
      reply.code(response.status);
      return body.length > 0 ? reply.send(body) : reply.send();
    }
  });
}
