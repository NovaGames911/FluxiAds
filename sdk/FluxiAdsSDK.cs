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
    public class FluxiAdsSDK : MonoBehaviour
    {
        // ─── Singleton ────────────────────────────────────────────────────────
        public static FluxiAdsSDK Instance { get; private set; }

        // ─── Inspector ────────────────────────────────────────────────────────
        [Header("FluxiAds Config")]
        public FluxiAdsConfig fluxiAdsConfig;

        [Header("Game Identity")]
        public string gameId;
        public string gameSlug;

        [Header("Ad IDs")]
        public string rewardedAdId;
        public string interstitialAdId;

        [Header("Callbacks")]
        public UnityEvent OnRewardedComplete;

        // ─── Internal state ───────────────────────────────────────────────────
        static readonly string JsonBaseUrl = "https://novagames911.github.io/FluxiAds/api/";
        static readonly TimeSpan CacheTTL  = TimeSpan.FromHours(24);

        AdPack _rewardedPack;
        AdPack _interstitialPack;
        string _cacheDir;
        bool   _adsReady;
        GameObject _adOverlay;
        VideoPlayer _videoPlayer;

        // ─── Unity lifecycle ──────────────────────────────────────────────────
        void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
                return;
            }

            _cacheDir = Path.Combine(Application.persistentDataPath, "FluxiAds");
            Directory.CreateDirectory(_cacheDir);
        }

        void Start()
        {
            if (fluxiAdsConfig == null)
            {
                Debug.LogError("[FluxiAds] FluxiAdsConfig not assigned.");
                return;
            }
            if (string.IsNullOrEmpty(gameSlug))
            {
                Debug.LogError("[FluxiAds] gameSlug is empty.");
                return;
            }
            StartCoroutine(FetchAdsManifest());
        }

        // ─── Manifest fetch ───────────────────────────────────────────────────
        IEnumerator FetchAdsManifest()
        {
            string url = JsonBaseUrl + gameSlug + ".json";
            Debug.Log($"[FluxiAds] Fetching: {url}");

            using var req = UnityWebRequest.Get(url);
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[FluxiAds] Fetch failed: {req.error}");
                yield break;
            }

            var manifest = JsonUtility.FromJson<AdsManifest>(req.downloadHandler.text);
            _rewardedPack     = FindPackById(manifest?.RewardedAds?.mediaPacks, rewardedAdId);
            _interstitialPack = FindPackById(manifest?.InterstitialAds?.mediaPacks, interstitialAdId);

            if (_rewardedPack == null)
                Debug.LogWarning($"[FluxiAds] Rewarded ID '{rewardedAdId}' not found.");
            if (_interstitialPack == null)
                Debug.LogWarning($"[FluxiAds] Interstitial ID '{interstitialAdId}' not found.");

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
                if (age < CacheTTL) { Debug.Log($"[FluxiAds] Cache hit: {Path.GetFileName(localPath)}"); yield break; }
            }
            using var req = UnityWebRequest.Get(url);
            yield return req.SendWebRequest();
            if (req.result == UnityWebRequest.Result.Success)
                File.WriteAllBytes(localPath, req.downloadHandler.data);
            else
                Debug.LogWarning($"[FluxiAds] Download failed: {req.error}");
        }

        string VideoPath(string id) => Path.Combine(_cacheDir, id + "_video.mp4");
        string ImagePath(string id) => Path.Combine(_cacheDir, id + "_image.png");

        // ─── Show Rewarded ────────────────────────────────────────────────────
        public void ShowRewardedAd()
        {
            if (!_adsReady || _rewardedPack == null)
            {
                Debug.LogWarning("[FluxiAds] Rewarded ad not ready.");
                return;
            }
            StartCoroutine(PlayRewardedAd(_rewardedPack));
        }

        IEnumerator PlayRewardedAd(AdPack pack)
        {
            string videoPath = VideoPath(pack.id);
            if (!File.Exists(videoPath)) { Debug.LogWarning("[FluxiAds] Video not cached."); yield break; }

            yield return StartCoroutine(LogEvent(pack.id, "impression"));

            var (overlay, rawImage, skipBtn, timerText) = BuildVideoOverlay();
            _adOverlay = overlay;

            _videoPlayer = overlay.AddComponent<VideoPlayer>();
            _videoPlayer.url             = "file://" + videoPath;
            _videoPlayer.renderMode      = VideoRenderMode.RenderTexture;
            _videoPlayer.isLooping       = false;
            _videoPlayer.playOnAwake     = false;
            _videoPlayer.audioOutputMode = VideoAudioOutputMode.AudioSource;
            var audioSrc = overlay.AddComponent<AudioSource>();
            _videoPlayer.SetTargetAudioSource(0, audioSrc);

            var rt = new RenderTexture(1920, 1080, 0);
            _videoPlayer.targetTexture = rt;
            rawImage.texture = rt;

            _videoPlayer.Prepare();
            yield return new WaitUntil(() => _videoPlayer.isPrepared);
            _videoPlayer.Play();

            float duration  = (float)_videoPlayer.length;
            float skipDelay = 15f;
            float elapsed   = 0f;
            bool  skipped   = false;

            skipBtn.gameObject.SetActive(false);
            skipBtn.onClick.AddListener(() => skipped = true);

            while (_videoPlayer.isPlaying && !skipped)
            {
                elapsed += Time.unscaledDeltaTime;
                if (elapsed >= skipDelay && !skipBtn.gameObject.activeSelf)
                    skipBtn.gameObject.SetActive(true);
                if (timerText != null)
                    timerText.text = elapsed < skipDelay ? $"Skip in {Mathf.CeilToInt(skipDelay - elapsed)}s" : "";
                yield return null;
            }

            // skipped = false means video finished naturally; skipped = true means skip button was pressed (only available after 15s)
            bool completed = !skipped;
            _videoPlayer.Stop();
            rt.Release();
            Destroy(overlay);

            if (completed)
            {
                yield return StartCoroutine(LogEvent(pack.id, "complete"));
                Debug.Log("[FluxiAds] Video complete — showing post-video image panel.");
                yield return StartCoroutine(ShowRewardedImagePanel(pack));
            }
            else
            {
                yield return StartCoroutine(LogEvent(pack.id, "skip"));
                Debug.Log("[FluxiAds] Rewarded skipped — no reward.");
            }
        }

        IEnumerator ShowRewardedImagePanel(AdPack pack)
        {
            string imagePath = ImagePath(pack.id);
            if (!File.Exists(imagePath))
            {
                // No image cached — fire reward directly
                OnRewardedComplete?.Invoke();
                Debug.Log("[FluxiAds] Rewarded complete (no post-video image).");
                yield break;
            }

            var imageData = File.ReadAllBytes(imagePath);
            var tex = new Texture2D(2, 2);
            tex.LoadImage(imageData);

            bool clicked = false;
            bool closed  = false;

            var (overlay, rawImage, closeBtn) = BuildImageOverlay();
            _adOverlay       = overlay;
            rawImage.texture = tex;

            var clickArea = rawImage.gameObject.AddComponent<Button>();
            clickArea.onClick.AddListener(() => clicked = true);
            closeBtn.onClick.AddListener(() => closed   = true);

            yield return new WaitUntil(() => clicked || closed);

            Destroy(overlay);
            Destroy(tex);

            if (clicked)
            {
                yield return StartCoroutine(LogEvent(pack.id, "click"));
                if (!string.IsNullOrEmpty(pack.webURL))
                    Application.OpenURL(pack.webURL);
            }

            // Reward fires after image panel is closed, regardless of click or close
            OnRewardedComplete?.Invoke();
            Debug.Log("[FluxiAds] Rewarded complete.");
        }

        // ─── Show Interstitial ────────────────────────────────────────────────
        public void ShowInterstitialAd()
        {
            if (!_adsReady || _interstitialPack == null)
            {
                Debug.LogWarning("[FluxiAds] Interstitial not ready.");
                return;
            }
            StartCoroutine(PlayInterstitialAd(_interstitialPack));
        }

        IEnumerator PlayInterstitialAd(AdPack pack)
        {
            string imagePath = ImagePath(pack.id);
            if (!File.Exists(imagePath)) { Debug.LogWarning("[FluxiAds] Image not cached."); yield break; }

            yield return StartCoroutine(LogEvent(pack.id, "impression"));

            var imageData = File.ReadAllBytes(imagePath);
            var tex = new Texture2D(2, 2);
            tex.LoadImage(imageData);

            bool clicked = false;
            bool closed  = false;

            var (overlay, rawImage, closeBtn) = BuildImageOverlay();
            _adOverlay       = overlay;
            rawImage.texture = tex;

            var clickArea = rawImage.gameObject.AddComponent<Button>();
            clickArea.onClick.AddListener(() => clicked = true);
            closeBtn.onClick.AddListener(() => closed  = true);

            yield return new WaitUntil(() => clicked || closed);

            Destroy(overlay);
            Destroy(tex);

            if (clicked)
            {
                yield return StartCoroutine(LogEvent(pack.id, "click"));
                if (!string.IsNullOrEmpty(pack.webURL))
                    Application.OpenURL(pack.webURL);
            }
            else
            {
                yield return StartCoroutine(LogEvent(pack.id, "skip"));
            }
        }

        // ─── UI Builders ──────────────────────────────────────────────────────
        (GameObject, RawImage, Button, Text) BuildVideoOverlay()
        {
            var canvas = new GameObject("FluxiAds_Video");
            var c = canvas.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 999;
            canvas.AddComponent<CanvasScaler>();
            canvas.AddComponent<GraphicRaycaster>();

            var bg = new GameObject("BG"); bg.transform.SetParent(canvas.transform, false);
            var bgImg = bg.AddComponent<RawImage>(); bgImg.color = Color.black;
            Stretch(bg);

            var surface = new GameObject("Video"); surface.transform.SetParent(canvas.transform, false);
            var raw = surface.AddComponent<RawImage>();
            Stretch(surface);

            var timerGo = new GameObject("Timer"); timerGo.transform.SetParent(canvas.transform, false);
            var timerTxt = timerGo.AddComponent<Text>();
            timerTxt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            timerTxt.fontSize = 22; timerTxt.color = Color.white;
            timerTxt.alignment = TextAnchor.UpperRight;
            var tr = timerGo.GetComponent<RectTransform>();
            tr.anchorMin = tr.anchorMax = tr.pivot = new Vector2(1, 1);
            tr.anchoredPosition = new Vector2(-16, -16); tr.sizeDelta = new Vector2(200, 40);

            var skipGo = new GameObject("Skip"); skipGo.transform.SetParent(canvas.transform, false);
            var skipBtn = skipGo.AddComponent<Button>();
            var skipImg = skipGo.AddComponent<Image>(); skipImg.color = new Color(0, 0, 0, 0.65f);
            var sr = skipGo.GetComponent<RectTransform>();
            sr.anchorMin = sr.pivot = Vector2.zero; sr.anchorMax = Vector2.zero;
            sr.anchoredPosition = new Vector2(16, 16); sr.sizeDelta = new Vector2(120, 40);
            var skipLbl = new GameObject("Lbl"); skipLbl.transform.SetParent(skipGo.transform, false);
            var st = skipLbl.AddComponent<Text>();
            st.text = "Skip ›"; st.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            st.fontSize = 18; st.color = Color.white; st.alignment = TextAnchor.MiddleCenter;
            Stretch(skipLbl);

            return (canvas, raw, skipBtn, timerTxt);
        }

        (GameObject, RawImage, Button) BuildImageOverlay()
        {
            var canvas = new GameObject("FluxiAds_Image");
            var c = canvas.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 999;
            canvas.AddComponent<CanvasScaler>();
            canvas.AddComponent<GraphicRaycaster>();

            var bg = new GameObject("BG"); bg.transform.SetParent(canvas.transform, false);
            var bgImg = bg.AddComponent<RawImage>(); bgImg.color = Color.black;
            Stretch(bg);

            var surface = new GameObject("Ad"); surface.transform.SetParent(canvas.transform, false);
            var raw = surface.AddComponent<RawImage>();
            Stretch(surface);

            var closeGo = new GameObject("Close"); closeGo.transform.SetParent(canvas.transform, false);
            var closeBtn = closeGo.AddComponent<Button>();
            var closeImg = closeGo.AddComponent<Image>(); closeImg.color = new Color(0, 0, 0, 0.65f);
            var cr = closeGo.GetComponent<RectTransform>();
            cr.anchorMin = cr.anchorMax = cr.pivot = new Vector2(1, 1);
            cr.anchoredPosition = new Vector2(-16, -16); cr.sizeDelta = new Vector2(40, 40);
            var closeLbl = new GameObject("Lbl"); closeLbl.transform.SetParent(closeGo.transform, false);
            var ct = closeLbl.AddComponent<Text>();
            ct.text = "X"; ct.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            ct.fontSize = 22; ct.color = Color.white; ct.alignment = TextAnchor.MiddleCenter;
            Stretch(closeLbl);

            return (canvas, raw, closeBtn);
        }

        void Stretch(GameObject go)
        {
            var r = go.GetComponent<RectTransform>();
            if (r == null) r = go.AddComponent<RectTransform>();
            r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one;
            r.offsetMin = r.offsetMax = Vector2.zero;
        }

        // ─── Event logging ────────────────────────────────────────────────────
        IEnumerator LogEvent(string adId, string type)
        {
            if (fluxiAdsConfig == null) yield break;
            string url  = fluxiAdsConfig.supabaseUrl.TrimEnd('/') + "/rest/v1/events";
            string body = JsonUtility.ToJson(new EventPayload { ad_id = adId, game_id = gameId, type = type });

            using var req = new UnityWebRequest(url, "POST");
            req.uploadHandler   = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("apikey", fluxiAdsConfig.supabaseAnonKey);
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
                Debug.LogWarning($"[FluxiAds] Log failed ({type}): {req.error}");
            else
                Debug.Log($"[FluxiAds] Logged: {type}");
        }

        // ─── Models ───────────────────────────────────────────────────────────
        [Serializable] class AdsManifest { public AdGroup RewardedAds; public AdGroup InterstitialAds; }
        [Serializable] class AdGroup { public bool mixAds; public AdPack[] mediaPacks; }
        [Serializable] class AdPack { public string id; public string videoURL; public string imageURL; public string webURL; public int priority; }
        [Serializable] class EventPayload { public string ad_id; public string game_id; public string type; }
    }
}