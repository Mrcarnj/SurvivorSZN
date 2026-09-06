import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Cron endpoints accept either caller:
 *
 *  - Vercel's scheduler. Setting a CRON_SECRET env var on the project makes
 *    Vercel send it as `Authorization: Bearer <CRON_SECRET>` on every cron
 *    invocation, which is what this compares against.
 *  - A signed-in commissioner, so the same job can be forced from the browser
 *    without knowing the secret.
 *
 * With no CRON_SECRET set, only the commissioner path works — the endpoint is
 * never left open.
 */
export async function isCronOrAdmin(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`)
    return true;

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;

  const { data: profile } = await sb
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return !!profile?.is_admin;
}
