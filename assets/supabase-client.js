/* ============================================================
   RF9 — shared Supabase client
   ============================================================
   Used by both the public site (lead form, via the submit_lead
   RPC only) and the internal /admin dashboard (authenticated
   staff access, gated entirely by Row Level Security).

   The key below is the PUBLIC anon/publishable key — it is safe
   to ship in client code by design; it has no privileges on its
   own beyond what RLS policies explicitly grant to the `anon` and
   `authenticated` roles in the database. The service_role key
   (which bypasses RLS) must never appear here or anywhere in the
   browser.
   ------------------------------------------------------------ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://tbyybujjtdayxqcddtwf.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_iKKUl5TzpfVQjvWFPk8Tkg_zLjsoJQr';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[RF9] supabase-js failed to load before supabase-client.js');
    return;
  }

  window.rf9Supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})();
