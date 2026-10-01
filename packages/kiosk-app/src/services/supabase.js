import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://schwdhhqngrfjkhobwuo.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseAnonKey);
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
