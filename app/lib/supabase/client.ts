// app/lib/supabase/client.ts
"use client";

import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// opcional: alias temporal para no romper imports viejos
export const supabase = supabaseBrowser;
