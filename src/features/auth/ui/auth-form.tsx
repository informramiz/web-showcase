"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError } from "@/components/field";
import type { ActionState } from "@/server/action-state";
import { loginAction, registerAction } from "../server/actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const [state, action, pending] = useActionState<ActionState, FormData>(isLogin ? loginAction : registerAction, {});
  // Field errors that duplicate the banner message are shown once, in the banner.
  const fields = state.fields ?? {};
  const fieldErrors = (name: string) => fields[name]?.filter((m) => m !== state.error);

  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold">{isLogin ? "Sign in" : "Create an account"}</h1>
        <p className="mt-1 text-sm text-muted">
          {isLogin ? "Welcome back to TeamBoard." : "Start tracking your team's work."}
        </p>
      </div>
      <FormError message={state.error === "Invalid input" ? undefined : state.error} />
      {!isLogin && <Field label="Name" name="name" autoComplete="name" required errors={fieldErrors("name")} />}
      <Field label="Email" name="email" type="email" autoComplete="email" required errors={fieldErrors("email")} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={isLogin ? "current-password" : "new-password"}
        minLength={isLogin ? undefined : 8}
        required
        errors={fieldErrors("password")}
      />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link href={isLogin ? "/register" : "/login"} className="font-medium text-accent hover:underline">
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
      {isLogin && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <a href="/api/demo" className="btn-ghost w-full">
            Explore the live demo
          </a>
          <p className="text-center text-xs text-muted">No sign-up — jump straight into a populated workspace.</p>
        </>
      )}
    </form>
  );
}
