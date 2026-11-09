export type AppErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payment_required"
  | "length_required"
  | "too_large"
  | "rate_limited"
  | "unavailable";

const STATUS: Record<AppErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payment_required: 402,
  length_required: 411,
  too_large: 413,
  rate_limited: 429,
  unavailable: 503,
};

/** A failure the domain expects and the transport layer maps to a response. */
export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    return STATUS[this.kind];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
