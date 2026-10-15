import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

/** Opens the billing provider's hosted portal (cancel, change card, invoices). */
export function ManageBillingButton({ className = "link-button" }: { className?: string }) {
  const portal = useMutation({
    mutationFn: api.portal,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  return (
    <button
      type="button"
      className={className}
      onClick={() => portal.mutate()}
      disabled={portal.isPending}
      title={portal.isError ? "Couldn't open billing. Try again." : undefined}
    >
      {portal.isError ? "Billing unavailable" : "Manage billing"}
    </button>
  );
}
