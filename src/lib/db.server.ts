import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configError = "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set";
if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error(configError);

export const db = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: { persistSession: false },
});
