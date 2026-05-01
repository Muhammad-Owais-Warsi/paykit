"use client";

import { useCustomer, useListPlans } from "autumn-js/react";
import { useState } from "react";

import { PlanCard } from "@/app/_components/plan-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { planCatalog } from "@/lib/demo-catalog";

function formatDate(ts: number | null) {
  if (ts == null) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AutumnSubscribePanel() {
  const { data: customer, attach, openCustomerPortal } = useCustomer();
  const { data: plans, isLoading: isLoadingPlans } = useListPlans();
  const [isPending, setIsPending] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeSub = customer?.subscriptions?.find((s) =>
    ["active", "trialing", "past_due"].includes(s.status),
  );
  const scheduledSub = customer?.subscriptions?.find((s) => s.status === "scheduled");

  const activePlanId = activeSub?.planId ?? null;

  function getPlanAction(planId: string) {
    if (scheduledSub?.planId === planId) {
      return { disabled: true, label: "Scheduled" };
    }

    if (activePlanId === planId) {
      if (activeSub?.canceledAt || scheduledSub) {
        return { disabled: false, label: "Resubscribe" };
      }
      return { disabled: true, label: "Current plan" };
    }

    const target = planCatalog.find((p) => p.id === planId);
    if (!target) return { disabled: false, label: "Choose plan" };

    if (!activePlanId) {
      return {
        disabled: false,
        label: target.priceAmount == null ? "Get started" : "Subscribe",
      };
    }

    const activeCatalog = planCatalog.find((p) => p.id === activePlanId);
    const activeAmount = activeCatalog?.priceAmount ?? 0;
    const targetAmount = target.priceAmount ?? 0;

    if (targetAmount > activeAmount) return { disabled: false, label: "Upgrade" };
    if (targetAmount < activeAmount) return { disabled: false, label: "Downgrade" };
    return { disabled: false, label: "Switch" };
  }

  async function handleSubscribe(planId: string) {
    setIsPending(true);
    setErrorMessage("");
    try {
      await attach({
        planId,
        successUrl: `${window.location.origin}/?checkout=success`,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setIsPending(false);
    }
  }

  async function handlePortal() {
    setPortalPending(true);
    try {
      await openCustomerPortal({
        returnUrl: window.location.href,
      });
    } finally {
      setPortalPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Current plan */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Current plan</h2>
          {activeSub ? (
            <Button variant="outline" size="sm" disabled={portalPending} onClick={handlePortal}>
              Manage billing
            </Button>
          ) : null}
        </div>
        {isLoadingPlans ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : activeSub ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-lg font-semibold">
              {plans?.find((p) => p.id === activeSub.planId)?.name ?? activeSub.planId}
            </span>
            <Badge variant="secondary">{activeSub.status}</Badge>
            {scheduledSub ? <Badge variant="outline">change pending</Badge> : null}
            <span className="text-muted-foreground text-sm">
              {activeSub.currentPeriodEnd
                ? activeSub.canceledAt || scheduledSub
                  ? `Ends ${formatDate(activeSub.currentPeriodEnd)}`
                  : `Renews ${formatDate(activeSub.currentPeriodEnd)}`
                : null}
            </span>
            {scheduledSub ? (
              <span className="text-muted-foreground text-sm">
                &rarr;{" "}
                {plans?.find((p) => p.id === scheduledSub.planId)?.name ?? scheduledSub.planId}{" "}
                {scheduledSub.startedAt
                  ? `on ${formatDate(scheduledSub.startedAt)}`
                  : "at end of period"}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No active plan.</p>
        )}
      </section>

      <Separator />

      {/* Plan cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Choose a plan</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {planCatalog.map((plan) => {
            const isCurrent = activePlanId === plan.id;
            const action = getPlanAction(plan.id);

            return (
              <PlanCard
                key={plan.id}
                action={action}
                isCurrent={isCurrent}
                isPending={isPending}
                onSelect={() => void handleSubscribe(plan.id)}
                plan={plan}
              />
            );
          })}
        </div>
      </section>

      {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
    </div>
  );
}
