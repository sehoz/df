import { createApp } from './app.js';

const app = createApp();

export const main_handler = async (event: { httpMethod?: string; path?: string; headers?: Record<string, string>; body?: string }) => {
  const method = event.httpMethod || 'GET';
  const path = event.path || '/';
  const request = new Request(`https://scf.local${path}`, {
    method,
    headers: event.headers,
    body: event.body,
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
