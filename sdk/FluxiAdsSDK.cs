using System;
using System.Collections;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Networking;
using UnityEngine.UI;
using UnityEngine.Video;

namespace FluxiAds
{
    /// <summary>
    /// FluxiAds SDK for Unity.
    /// Drop onto any persistent GameObject, fill 3 IDs in Inspector, done.
    /// Replaces AdsHolder.cs, JsonURLs.cs, CountdownTimer.cs.
    /// </summary>
    public class FluxiAdsSDK : MonoBehaviour
    {
        // ─── Inspector ────────────────────────────────────────────────────────

        [Header("FluxiAds Config")]
        [Tooltip("ScriptableObject with Supabase URL + Anon Key")]
        public FluxiAdsConfig fluxiAdsConfig;

        [Header("Game Identity")]
        [Tooltip("Game UUID from Supabase games table")]
        public string gameId;

        [Tooltip("Game slug — used to fetch: novagames911.github.io/FluxiAds/api/{slug}.json")]
        public string gameSlug;

        [Header("Ad IDs")]
        [Tooltip("UUID of the rewarded ad pack from Supabase ads table")]
        public string rewardedAdId;

        [Tooltip("UUID of the interstitial ad pack from Supabase ads table")]
        public string interstitialAdId;

        [Header("Callbacks")]
        [Tooltip("Fired when rewarded video is watched to completion")]
        public UnityEvent OnRewardedComplete;

        // ─── Internal state ───────────────────────────────────────────────────

        static readonly string JsonBaseUrl = "https://novagames911.github.io/FluxiAds/api/";
        static readonly TimeSpan CacheTTL  = TimeSpan.FromHours(24);

        AdPack _rewardedPack;
        AdPack _interstitialPack;

        string _cacheDir;
        bool   _adsReady;

        // Runtime UI (built at runtime, destroyed after use)
        GameObject    _adOverlay;
        VideoPlayer   _videoPlayer;
        RawImage      _imageDisplay;

        // ─── Unity lifecycle ──────────────────────────────────────────────────

        void Awake()
        {
            _cacheDir = Path.Combine(Application.persistentDataPath, "FluxiAds");
            Directory.CreateDirectory(_cacheDir);
        }

        void Start()
        {
            if (fluxiAdsConfig == null)
            {
                Debug.LogError("[FluxiAds] FluxiAdsConfig is not assigned. Assign it in the Inspector.");
                return;
            }

            if (string.IsNullOrEmpty(gameSlug))
            {
                Debug.LogError("[FluxiAds] gameSlug is empty. Set it in the Inspector.");
                return;
            }

            StartCoroutine(FetchAdsManifest());
        }

        // ─── Manifest fetch ───────────────────────────────────────────────────

        IEnumerator FetchAdsManifest()
        {
            string url = JsonBaseUrl + gameSlug + ".json";
            Debug.Log($"[FluxiAds] Fetching manifest: {url}");

            using var req = UnityWebRequest.Get(url);
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[FluxiAds] Manifest fetch failed: {req.error}");
                yield break;
            }

            var manifest = JsonUtility.FromJson<AdsManifest>(req.downloadHandler.text);

            _rewardedPack      = FindPackById(manifest?.RewardedAds?.mediaPacks, rewardedAdId);
            _interstitialPack  = FindPackById(manifest?.InterstitialAds?.mediaPacks, interstitialAdId);

            if (_rewardedPack == null)
                Debug.LogWarning($"[FluxiAds] Rewarded ad ID '{rewardedAdId}' not found in manifest.");

            if (_interstitialPack == null)
                Debug.LogWarning($"[FluxiAds] Interstitial ad ID '{interstitialAdId}' not found in manifest.");

            yield return StartCoroutine(CacheAdPack(_rewardedPack));
            yield return StartCoroutine(CacheAdPack(_interstitialPack));

            _adsReady = true;
            Debug.Log("[FluxiAds] Ads ready.");
        }

        AdPack FindPackById(AdPack[] packs, string id)
        {
            if (packs == null || string.IsNullOrEmpty(id)) return null;
            foreach (var p in packs)
                if (p.id == id) return p;
            return null;
        }

        // ─── Cache ────────────────────────────────────────────────────────────

        IEnumerator CacheAdPack(AdPack pack)
        {
            if (pack == null) yield break;

            if (!string.IsNullOrEmpty(pack.videoURL))
                yield return StartCoroutine(CacheFile(pack.videoURL, VideoPath(pack.id)));

            if (!string.IsNullOrEmpty(pack.imageURL))
                yield return StartCoroutine(CacheFile(pack.imageURL, ImagePath(pack.id)));
        }

        IEnumerator CacheFile(string url, string localPath)
        {
            if (File.Exists(localPath))
            {
                var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(localPath);
                if (age < CacheTTL)
                {
                    Debug.Log($"[FluxiAds] Cache hit: {Path.GetFileName(localPath)}");
                    yield break;
                }
            }

            Debug.Log($"[FluxiAds] Downloading: {url}");
            using var req = UnityWebRequest.Get(url);
            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
                File.WriteAllBytes(localPath, req.downloadHandler.data);
            else
                Debug.LogWarning($"[FluxiAds] Download failed for {url}: {req.error}");
        }

        string VideoPath(string id) => Path.Combine(_cacheDir, id + "_video.mp4");
        string ImagePath(string id) => Path.Combine(_cacheDir, id + "_image.png");

        // ─── Show Rewarded Ad ─────────────────────────────────────────────────

        /// <summary>
        /// Shows the rewarded video ad. Fires OnRewardedComplete when watched fully.
        /// </summary>
        public void ShowRewardedAd()
        {
            if (!_adsReady || _rewardedPack == null)
            {
                Debug.LogWarning("[FluxiAds] Rewarded ad not ready yet.");
                return;
            }

            StartCoroutine(PlayRewardedAd(_rewardedPack));
        }

        IEnumerator PlayRewardedAd(AdPack pack)
        {
            string videoPath = VideoPath(pack.id);
            if (!File.Exists(videoPath))
            {
                Debug.LogWarning("[FluxiAds] Rewarded video file not cached.");
                yield break;
            }

            // Log impression immediately
            yield return StartCoroutine(LogEvent(pack.id, "impression"));

            // Build overlay UI
            var (overlay, rawImage, skipBtn, timerText) = BuildVideoOverlay();
            _adOverlay = overlay;

            // Set up VideoPlayer
            _videoPlayer = overlay.AddComponent<VideoPlayer>();
            _videoPlayer.url            = "file://" + videoPath;
            _videoPlayer.renderMode     = VideoRenderMode.RenderTexture;
            _videoPlayer.isLooping      = false;
            _videoPlayer.playOnAwake    = false;
            _videoPlayer.audioOutputMode = VideoAudioOutputMode.AudioSource;
            var audioSrc = overlay.AddComponent<AudioSource>();
            _videoPlayer.SetTargetAudioSource(0, audioSrc);

            var rt = new RenderTexture(1920, 1080, 0);
            _videoPlayer.targetTexture = rt;
            rawImage.texture = rt;

            _videoPlayer.Prepare();
            yield return new WaitUntil(() => _videoPlayer.isPrepared);
            _videoPlayer.Play();

            float duration   = (float)_videoPlayer.length;
            float skipDelay  = Mathf.Min(5f, duration);
            float elapsed    = 0f;
            bool  skipped    = false;
            bool  completed  = false;

            skipBtn.gameObject.SetActive(false);

            // Listen for skip button
            skipBtn.onClick.AddListener(() =>
            {
                skipped = true;
            });

            while (_videoPlayer.isPlaying && !skipped)
            {
                elapsed += Time.deltaTime;

                // Show skip button after skipDelay seconds
                if (elapsed >= skipDelay && !skipBtn.gameObject.activeSelf)
                    skipBtn.gameObject.SetActive(true);

                // Countdown timer before skip is allowed
                if (elapsed < skipDelay && timerText != null)
                    timerText.text = $"Skip in {Mathf.CeilToInt(skipDelay - elapsed)}s";
                else if (timerText != null)
                    timerText.text = "";

                yield return null;
            }

            if (!skipped && elapsed >= duration - 0.5f)
                completed = true;

            _videoPlayer.Stop();
            rt.Release();
            Destroy(overlay);

            if (completed)
            {
                yield return StartCoroutine(LogEvent(pack.id, "complete"));
                Debug.Log("[FluxiAds] Rewarded ad complete — rewarding player.");
                OnRewardedComplete?.Invoke();
            }
            else
            {
                yield return StartCoroutine(LogEvent(pack.id, "skip"));
                Debug.Log("[FluxiAds] Rewarded ad skipped.");
            }
        }

        // ─── Show Interstitial Ad ─────────────────────────────────────────────

        /// <summary>
        /// Shows the interstitial image ad. Tap logs click + opens URL. Close logs skip.
        /// </summary>
        public void ShowInterstitialAd()
        {
            if (!_adsReady || _interstitialPack == null)
            {
                Debug.LogWarning("[FluxiAds] Interstitial ad not ready yet.");
                return;
            }

            StartCoroutine(PlayInterstitialAd(_interstitialPack));
        }

        IEnumerator PlayInterstitialAd(AdPack pack)
        {
            string imagePath = ImagePath(pack.id);
            if (!File.Exists(imagePath))
            {
                Debug.LogWarning("[FluxiAds] Interstitial image file not cached.");
                yield break;
            }

            yield return StartCoroutine(LogEvent(pack.id, "impression"));

            // Load image
            var imageData = File.ReadAllBytes(imagePath);
            var tex       = new Texture2D(2, 2);
            tex.LoadImage(imageData);

            bool clicked = false;
            bool closed  = false;

            var (overlay, rawImage, closeBtn) = BuildImageOverlay();
            _adOverlay     = overlay;
            rawImage.texture = tex;

            // Click on ad image → open webURL
            var clickArea = rawImage.gameObject.AddComponent<Button>();
            clickArea.onClick.AddListener(() =>
            {
                clicked = true;
            });

            closeBtn.onClick.AddListener(() =>
            {
                closed = true;
            });

            yield return new WaitUntil(() => clicked || closed);

            Destroy(overlay);
            Destroy(tex);

            if (clicked)
            {
                yield return StartCoroutine(LogEvent(pack.id, "click"));
                Debug.Log("[FluxiAds] Interstitial clicked.");
                if (!string.IsNullOrEmpty(pack.webURL))
                    Application.OpenURL(pack.webURL);
            }
            else
            {
                yield return StartCoroutine(LogEvent(pack.id, "skip"));
                Debug.Log("[FluxiAds] Interstitial closed.");
            }
        }

        // ─── UI Builders ──────────────────────────────────────────────────────

        (GameObject overlay, RawImage rawImage, Button skipBtn, Text timerText) BuildVideoOverlay()
        {
            var canvas = new GameObject("FluxiAds_VideoOverlay");
            var c      = canvas.AddComponent<Canvas>();
            c.renderMode  = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 999;
            canvas.AddComponent<CanvasScaler>();
            canvas.AddComponent<GraphicRaycaster>();

            // Black background
            var bg      = new GameObject("Background");
            bg.transform.SetParent(canvas.transform, false);
            var bgImg   = bg.AddComponent<RawImage>();
            bgImg.color = Color.black;
            var bgRect  = bg.GetComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.offsetMin = bgRect.offsetMax = Vector2.zero;

            // Video surface
            var surface     = new GameObject("VideoSurface");
            surface.transform.SetParent(canvas.transform, false);
            var rawImage    = surface.AddComponent<RawImage>();
            var surfaceRect = surface.GetComponent<RectTransform>();
            surfaceRect.anchorMin = Vector2.zero;
            surfaceRect.anchorMax = Vector2.one;
            surfaceRect.offsetMin = surfaceRect.offsetMax = Vector2.zero;

            // Timer text
            var timerGo   = new GameObject("TimerText");
            timerGo.transform.SetParent(canvas.transform, false);
            var timerText = timerGo.AddComponent<Text>();
            timerText.font      = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            timerText.fontSize  = 22;
            timerText.color     = Color.white;
            timerText.alignment = TextAnchor.UpperRight;
            var timerRect = timerGo.GetComponent<RectTransform>();
            timerRect.anchorMin = new Vector2(1, 1);
            timerRect.anchorMax = new Vector2(1, 1);
            timerRect.pivot     = new Vector2(1, 1);
            timerRect.anchoredPosition = new Vector2(-16, -16);
            timerRect.sizeDelta = new Vector2(200, 40);

            // Skip button
            var skipGo  = new GameObject("SkipButton");
            skipGo.transform.SetParent(canvas.transform, false);
            var skipBtn = skipGo.AddComponent<Button>();
            var skipImg = skipGo.AddComponent<Image>();
            skipImg.color = new Color(0f, 0f, 0f, 0.65f);
            var skipRect = skipGo.GetComponent<RectTransform>();
            skipRect.anchorMin = new Vector2(1, 0);
            skipRect.anchorMax = new Vector2(1, 0);
            skipRect.pivot     = new Vector2(1, 0);
            skipRect.anchoredPosition = new Vector2(-16, 16);
            skipRect.sizeDelta = new Vector2(120, 40);

            var skipLabel   = new GameObject("Label");
            skipLabel.transform.SetParent(skipGo.transform, false);
            var skipText    = skipLabel.AddComponent<Text>();
            skipText.text      = "Skip ›";
            skipText.font      = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            skipText.fontSize  = 18;
            skipText.color     = Color.white;
            skipText.alignment = TextAnchor.MiddleCenter;
            var skipLabelRect  = skipLabel.GetComponent<RectTransform>();
            skipLabelRect.anchorMin = Vector2.zero;
            skipLabelRect.anchorMax = Vector2.one;
            skipLabelRect.offsetMin = skipLabelRect.offsetMax = Vector2.zero;

            return (canvas, rawImage, skipBtn, timerText);
        }

        (GameObject overlay, RawImage rawImage, Button closeBtn) BuildImageOverlay()
        {
            var canvas = new GameObject("FluxiAds_ImageOverlay");
            var c      = canvas.AddComponent<Canvas>();
            c.renderMode   = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 999;
            canvas.AddComponent<CanvasScaler>();
            canvas.AddComponent<GraphicRaycaster>();

            // Black background
            var bg      = new GameObject("Background");
            bg.transform.SetParent(canvas.transform, false);
            var bgImg   = bg.AddComponent<RawImage>();
            bgImg.color = Color.black;
            var bgRect  = bg.GetComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.offsetMin = bgRect.offsetMax = Vector2.zero;

            // Ad image
            var surface     = new GameObject("AdImage");
            surface.transform.SetParent(canvas.transform, false);
            var rawImage    = surface.AddComponent<RawImage>();
            var surfaceRect = surface.GetComponent<RectTransform>();
            surfaceRect.anchorMin = Vector2.zero;
            surfaceRect.anchorMax = Vector2.one;
            surfaceRect.offsetMin = surfaceRect.offsetMax = Vector2.zero;

            // Close button
            var closeGo  = new GameObject("CloseButton");
            closeGo.transform.SetParent(canvas.transform, false);
            var closeBtn = closeGo.AddComponent<Button>();
            var closeImg = closeGo.AddComponent<Image>();
            closeImg.color = new Color(0f, 0f, 0f, 0.65f);
            var closeRect = closeGo.GetComponent<RectTransform>();
            closeRect.anchorMin = new Vector2(1, 1);
            closeRect.anchorMax = new Vector2(1, 1);
            closeRect.pivot     = new Vector2(1, 1);
            closeRect.anchoredPosition = new Vector2(-16, -16);
            closeRect.sizeDelta = new Vector2(40, 40);

            var closeLabel  = new GameObject("Label");
            closeLabel.transform.SetParent(closeGo.transform, false);
            var closeText   = closeLabel.AddComponent<Text>();
            closeText.text      = "✕";
            closeText.font      = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            closeText.fontSize  = 22;
            closeText.color     = Color.white;
            closeText.alignment = TextAnchor.MiddleCenter;
            var closeLabelRect  = closeLabel.GetComponent<RectTransform>();
            closeLabelRect.anchorMin = Vector2.zero;
            closeLabelRect.anchorMax = Vector2.one;
            closeLabelRect.offsetMin = closeLabelRect.offsetMax = Vector2.zero;

            return (canvas, rawImage, closeBtn);
        }

        // ─── Supabase Event Logging ───────────────────────────────────────────

        IEnumerator LogEvent(string adId, string type)
        {
            if (fluxiAdsConfig == null) yield break;

            string url  = fluxiAdsConfig.supabaseUrl.TrimEnd('/') + "/rest/v1/events";
            string body = JsonUtility.ToJson(new EventPayload
            {
                ad_id   = adId,
                game_id = gameId,
                type    = type
            });

            using var req = new UnityWebRequest(url, "POST");
            req.uploadHandler   = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("apikey", fluxiAdsConfig.supabaseAnonKey);

            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
                Debug.LogWarning($"[FluxiAds] Event log failed ({type}): {req.error}");
            else
                Debug.Log($"[FluxiAds] Event logged: {type} | ad={adId}");
        }

        // ─── Data models (must match JSON from FluxiAds dashboard) ────────────

        [Serializable] class AdsManifest
        {
            public AdGroup RewardedAds;
            public AdGroup InterstitialAds;
        }

        [Serializable] class AdGroup
        {
            public bool    mixAds;
            public AdPack[] mediaPacks;
        }

        [Serializable] class AdPack
        {
            public string id;
            public string videoURL;
            public string imageURL;
            public string webURL;
            public int    priority;
        }

        [Serializable] class EventPayload
        {
            public string ad_id;
            public string game_id;
            public string type;
        }
    }
}
