// Public browser credentials only. No service-role key or Google client secret.
window.TennisSlicePopAuthConfig = Object.freeze({
  url: 'https://pmeqgwowhgdeumedfgpj.supabase.co',
  publishableKey: 'sb_publishable_uroIPp1r0DxYoTwLJLF_Dg_CQOKQkBy',
});
window.TennisSlicePopRankingAdapter = window.TennisSlicePopAuth.createAdapter(
  window.TennisSlicePopSupabase.createClient,
  window.TennisSlicePopAuthConfig,
);
