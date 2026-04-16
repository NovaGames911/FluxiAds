using UnityEngine;

namespace FluxiAds
{
    /// <summary>
    /// ScriptableObject that holds FluxiAds credentials.
    /// Create once via Assets → Create → FluxiAds → Ads Config.
    /// Assign to FluxiAdsSDK in the Inspector.
    /// </summary>
    [CreateAssetMenu(
        fileName = "FluxiAdsConfig",
        menuName  = "FluxiAds/Ads Config",
        order     = 0
    )]
    public class FluxiAdsConfig : ScriptableObject
    {
        [Header("Supabase Credentials")]
        [Tooltip("Your Supabase project URL — e.g. https://xxxx.supabase.co")]
        public string supabaseUrl;

        [Tooltip("Supabase anon/public key for unauthenticated REST access")]
        [TextArea(2, 3)]
        public string supabaseAnonKey;
    }
}
