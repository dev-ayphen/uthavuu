import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * A missing resource uses `not-found`, never a thrown error — a 404 is an
 * expected outcome, not a fault. Permission-denied gets its own copy elsewhere:
 * telling someone a record does not exist when they simply cannot see it is a
 * different (and more confusing) message.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6 text-center shadow-raised">
        <div className="mx-auto flex size-10 items-center justify-center rounded-control bg-neutral-soft text-neutral-fg">
          <Compass className="size-5" />
        </div>
        <h1 className="mt-4 text-base font-bold text-fg">There&apos;s nothing at this address</h1>
        <p className="mt-1.5 text-fg-subtle">
          The page you asked for doesn&apos;t exist, or it moved. The dashboard is a good place to
          pick back up.
        </p>
        <Button asChild className="mt-5">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
