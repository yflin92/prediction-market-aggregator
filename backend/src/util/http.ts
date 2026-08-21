/**
 * Minimal fetch wrapper with a timeout and JSON parsing. Node 22 has global
 * fetch, so we only add cancellation and typed error handling on top.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function getJson<T>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 10_000, headers } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new HttpError(`GET ${url} failed: ${res.status}`, res.status, url);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
