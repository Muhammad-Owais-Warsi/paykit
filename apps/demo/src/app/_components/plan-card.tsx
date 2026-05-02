import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { planCatalog } from "@/lib/demo-catalog";

function formatPrice(amount: number | null) {
  if (amount == null) return "$0";
  return `$${(amount / 100).toFixed(2)}`;
}

export function PlanCard({
  action,
  isCurrent,
  isPending,
  onSelect,
  plan,
}: {
  action: { disabled: boolean; label: string };
  isCurrent: boolean;
  isPending: boolean;
  onSelect: () => void;
  plan: (typeof planCatalog)[number];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2">
          {plan.name}
          {isCurrent ? <Badge variant="secondary">current</Badge> : null}
        </CardTitle>
        <CardDescription>
          <span className="text-foreground text-2xl font-semibold">
            {formatPrice(plan.priceAmount)}
          </span>
          /mo
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-muted-foreground flex-1 text-sm">{plan.description}</p>
        <Button
          className="w-full"
          disabled={isPending || action.disabled}
          onClick={onSelect}
          variant={action.disabled ? "outline" : "default"}
          size="sm"
        >
          {action.label}
        </Button>
      </CardContent>
    </Card>
  );
}
