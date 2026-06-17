import { createApp } from './app';

const app = createApp();

interface CloudBaseHttpEvent {
  httpMethod?: string;
  path?: string;
  rawPath?: string;
  requestContext?: { path?: string; http?: { path?: string } };
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

function getPath(event: CloudBaseHttpEvent) {
  return event.path || event.rawPath || event.requestContext?.http?.path || event.requestContext?.path || '/';
}

export const main_handler = async (event: CloudBaseHttpEvent, _context?: unknown) => {
  const method = event.httpMethod || 'GET';
  const path = getPath(event);
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64')
      : event.body;
  const request = new Request(`https://scf.local${path}`, {
    method,
    headers: event.headers,
    body,
  });
  const response = await app.fetch(request);
  return {
    isBase64Encoded: false,
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
};

export default app;

