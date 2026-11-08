import { isAppError } from "@/core/errors";

/** What a form server action returns to `useActionState`. */
export interface ActionState {
  error?: string;
  fields?: Record<string, string[]>;
  ok?: boolean;
}

/** Turns an expected domain error into form state; anything else is a real bug and is rethrown. */
export function toActionState(e: unknown): ActionState {
  if (isAppError(e)) return { error: e.message, fields: e.fields };
  throw e;
}
