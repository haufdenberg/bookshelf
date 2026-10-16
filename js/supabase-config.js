// ============================================================================
// supabase-config.js — YOUR Supabase project credentials go here
//
// 1. Create a free project at https://supabase.com
// 2. Run supabase-schema.sql (in the project root) once, in your project's
//    SQL Editor (SQL Editor → New query → paste the whole file → Run)
// 3. Go to Project Settings → API and copy two values into the two lines
//    below: the "Project URL" and the "anon public" key.
//
// The anon key is DESIGNED to be public/client-side — it's not a secret.
// What actually protects your data is Row Level Security (the policies in
// supabase-schema.sql), which is enforced by Postgres itself regardless of
// what this key can see.
// ============================================================================

var SUPABASE_URL = 'https://siryiiqlynxokzawzmek.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_IIoHAYzCv6beICDj8P-J0Q_gU58iqA4';       // the long "anon public" key, NOT the "service_role" key

var supabaseClient = null;
if (SUPABASE_URL.indexOf('YOUR_') !== 0 && SUPABASE_ANON_KEY.indexOf('YOUR_') !== 0 && typeof window.supabase !== 'undefined') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn('Bookshelf: supabase-config.js still has placeholder credentials — edit that file with your project URL and anon key.');
}
