import type { ApiResponse } from "@repo/types";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Unwraps the `{ ok, data }` envelope and attaches the agent's bearer token. */
export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Could not reach the API server", "NETWORK_ERROR");
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError("The API returned an unreadable response", "BAD_RESPONSE");
  if (!body.ok) throw new ApiError(body.error.message, body.error.code);

  return body.data;
}
