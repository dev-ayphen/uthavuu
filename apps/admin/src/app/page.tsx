import { redirect } from "next/navigation";

/**
 * The console has no landing page of its own. Where "/" goes will be decided by
 * the session once auth lands: an operator to the dashboard, everyone else to
 * login. Until then it always heads for the dashboard, and the route guard in
 * `(console)/layout.tsx` will bounce anyone unauthenticated back to login.
 */
export default function RootPage() {
  redirect("/dashboard");
}
