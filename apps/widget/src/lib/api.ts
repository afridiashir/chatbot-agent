import type { ApiResponse } from "@repo/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Unwraps the `{ ok, data }` envelope, turning a failure into a thrown ApiError. */
export async function apiFetch<T>(
  apiUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("Could not reach the chat service", "NETWORK_ERROR");
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!body) throw new ApiError("The chat service returned an unreadable response", "BAD_RESPONSE");
  if (!body.ok) throw new ApiError(body.error.message, body.error.code);

  return body.data;
}
