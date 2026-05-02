import { Button } from "@/components/ui/button";

const usageAmounts = [1, 10, 100] as const;

export function UsageButtons({
  disabled,
  isPending,
  onTrack,
}: {
  disabled: boolean;
  isPending: boolean;
  onTrack: (amount: number) => void | Promise<void>;
}) {
  return (
    <div className="flex gap-1.5">
      {usageAmounts.map((amount) => (
        <Button
          key={amount}
          variant="outline"
          size="sm"
          disabled={isPending || disabled}
          onClick={() => {
            void onTrack(amount);
          }}
        >
          +{amount}
        </Button>
      ))}
    </div>
  );
}
