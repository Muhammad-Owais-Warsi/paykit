"use client";

import { toast } from "sonner";

import { UsageButtons } from "@/app/_components/usage-buttons";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { featureCatalog } from "@/lib/demo-catalog";
import type { PayKitScenario } from "@/lib/paykit-scenarios";
import { api } from "@/trpc/react";

function MeteredFeatureRow({
  scenario,
  featureId,
  name,
  description,
}: {
  description: string;
  featureId: string;
  name: string;
  scenario: PayKitScenario;
}) {
  const utils = api.useUtils();
  const paykitApi = scenario === "polar" ? api.paykitPolar : api.paykitStripe;
  const paykitUtils = scenario === "polar" ? utils.paykitPolar : utils.paykitStripe;
  const { data, isLoading } = paykitApi.checkFeature.useQuery({
    featureId,
  });

  const report = paykitApi.reportUsage.useMutation({
    onSuccess: (result) => {
      void paykitUtils.checkFeature.invalidate({ featureId });
      if (!result.success) {
        toast.error("Insufficient balance", {
          description: `Not enough ${name.toLowerCase()} remaining`,
        });
      }
    },
  });

  const balance = data?.balance;
  const used = balance ? balance.limit - balance.remaining : 0;
  const percentage = balance && balance.limit > 0 ? (used / balance.limit) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {data && !data.allowed ? <Badge variant="destructive">limit reached</Badge> : null}
        </div>
        {isLoading ? (
          <Skeleton className="h-4 w-20" />
        ) : balance && !balance.unlimited ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {used.toLocaleString()} / {balance.limit.toLocaleString()} used
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">No access</span>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-1 w-full" />
      ) : balance && !balance.unlimited ? (
        <Progress value={percentage} className="h-1.5" />
      ) : null}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">{description}</p>
        <UsageButtons
          disabled={!data?.allowed}
          isPending={report.isPending}
          onTrack={(amount) => report.mutate({ featureId, amount })}
        />
      </div>
    </div>
  );
}

function BooleanFeatureRow({
  scenario,
  featureId,
  name,
  description,
}: {
  description: string;
  featureId: string;
  name: string;
  scenario: PayKitScenario;
}) {
  const paykitApi = scenario === "polar" ? api.paykitPolar : api.paykitStripe;
  const { data, isLoading } = paykitApi.checkFeature.useQuery({
    featureId,
  });

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{name}</span>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-5 w-16" />
      ) : data?.allowed ? (
        <Badge variant="secondary">enabled</Badge>
      ) : (
        <Badge variant="outline">locked</Badge>
      )}
    </div>
  );
}

export function FeaturesPanel({ scenario }: { scenario: PayKitScenario }) {
  return (
    <div className="flex flex-col gap-4">
      {featureCatalog.map((feat) =>
        feat.type === "metered" ? (
          <MeteredFeatureRow
            key={feat.id}
            scenario={scenario}
            featureId={feat.id}
            name={feat.name}
            description={feat.description}
          />
        ) : (
          <BooleanFeatureRow
            key={feat.id}
            scenario={scenario}
            featureId={feat.id}
            name={feat.name}
            description={feat.description}
          />
        ),
      )}
    </div>
  );
}
