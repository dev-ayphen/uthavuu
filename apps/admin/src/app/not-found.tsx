import Link from "next/link";
import { Compass } from "lucide-react";
import { Button, FullPageState } from "@/components/ui";

/**
 * A missing resource uses `not-found`, never a thrown error — a 404 is an
 * expected outcome, not a fault. Permission-denied gets its own copy elsewhere:
 * telling someone a record does not exist when they simply cannot see it is a
 * different (and more confusing) message.
 */
export default function NotFound() {
  return (
    <FullPageState
      icon={Compass}
      tone="neutral"
      centered
      title="There's nothing at this address"
      description="The page you asked for doesn't exist, or it moved. The dashboard is a good place to pick back up."
    >
      <Button asChild className="mt-5">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </FullPageState>
  );
}
