// ── FluxiAds — Supabase Client ────────────────────────────────────────────────
// Reads connection keys from localStorage (set in Settings page).
// Falls back to project defaults so the app works out of the box.

const SUPABASE_URL = localStorage.getItem('supabase_url')
  || 'https://fteopoguabbydprwoyxv.supabase.co';

const SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key')
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZW9wb2d1YWJieWRwcndveXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyODczODUsImV4cCI6MjA5MTg2MzM4NX0.19hzkmEcLBXqBYB43hse9ZzaaAHvoYXzz-JyHpAys2o';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
