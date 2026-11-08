"use client";

import { useState } from "react";
import { FormError } from "@/components/field";
import type { BillingStatus } from "../domain/billing-service";

type EnabledStatus = Extract<BillingStatus, { enabled: true }>;

const limit = (n: number | null, noun: string) => (n === null ? `Unlimited ${noun}` : `Up to ${n} ${noun}`);

/** Plan, limits and a button to Stripe Checkout (Free) or the customer portal (Pro). Test mode only. */
export function BillingCard({ status }: { status: EnabledStatus }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function go(path: "checkout" | "portal") {
    setPending(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/billing/${path}`, { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: { message: string } };
      if (!res.ok || !body.url) throw new Error(body.error?.message ?? "Could not reach Stripe");
      window.location.assign(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Stripe");
      setPending(false);
    }
  }

  const pro = status.plan === "pro";
  return (
    <section className="card space-y-3 p-4" data-testid="billing-card">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Plan</h2>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{pro ? "Pro" : "Free"}</span>
      </div>
      <ul className="text-sm text-muted">
        <li>{limit(status.limits.ownedProjects, "projects")}</li>
        <li>{limit(status.limits.membersPerProject, "members per project")}</li>
        {status.status && status.status !== "active" && <li>Subscription: {status.status.replace("_", " ")}</li>}
      </ul>
      <FormError message={error} />
      {pro || status.canManage ? (
        <button className="btn-ghost w-full" disabled={pending} onClick={() => void go("portal")}>
          Manage subscription
        </button>
      ) : null}
      {!pro && (
        <button className="btn-primary w-full" disabled={pending} onClick={() => void go("checkout")}>
          {pending ? "Opening Stripe…" : "Upgrade to Pro"}
        </button>
      )}
      <p className="text-xs text-muted">Stripe test mode: use card 4242 4242 4242 4242.</p>
    </section>
  );
}
