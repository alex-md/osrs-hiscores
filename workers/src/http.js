export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Admin-Token",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
export function integer(value, fallback, min, max, name) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new HttpError(
      400,
      `${name} must be an integer between ${min} and ${max}.`,
    );
  return number;
}
export async function bodyJSON(request) {
  try {
    const text = await request.text();
    if (text.length > 64_000)
      throw new HttpError(413, "Request body is too large.");
    const body = text ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Send a valid JSON object.");
  }
}
export function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN)
    throw new HttpError(503, "Administrative access is not configured.");
  if (request.headers.get("x-admin-token") !== env.ADMIN_TOKEN)
    throw new HttpError(401, "A valid X-Admin-Token header is required.");
}
export function paginate(rows, params) {
  const limit = integer(params.get("limit"), 50, 1, 5000, "limit");
  const page = integer(params.get("page"), 1, 1, 1_000_000, "page");
  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const current = Math.min(page, pages);
  return {
    page: current,
    pages,
    limit,
    total: rows.length,
    players: rows.slice((current - 1) * limit, current * limit),
  };
}
