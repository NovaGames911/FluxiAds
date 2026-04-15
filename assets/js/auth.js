// ── FluxiAds — Auth ───────────────────────────────────────────────────────────
// Requires supabase.js loaded first (provides `sb`).
//
// Usage on protected pages:
//   await requireAuth();          // redirects to index.html if no session
//   const user = getUser();       // returns current user object or null
//   await logout();               // signs out + redirects to index.html

// ── Session guard ─────────────────────────────────────────────────────────────
// Call at the top of any protected page. Redirects to login if no session.
async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.replace('index.html');
    return null;
  }
  return session;
}

// ── Get current user (sync after requireAuth) ─────────────────────────────────
function getUser() {
  return sb.auth.user ? sb.auth.user() : null;
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  await sb.auth.signOut();
  window.location.replace('index.html');
}

// ── Listen for auth state changes ─────────────────────────────────────────────
// Re-check on token expiry or external sign-out so protected pages
// redirect automatically without a page refresh.
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
    // Only redirect if we're not already on the login page
    if (!window.location.pathname.endsWith('index.html') &&
        window.location.pathname !== '/') {
      window.location.replace('index.html');
    }
  }
});
