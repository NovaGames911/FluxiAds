# FluxiAds SDK for Unity

Version 1.0 | Compatible with Unity 2021.3 LTS and newer

---

## Overview

FluxiAds SDK is a two-script drop-in Unity integration for the FluxiAds ad network. It fetches ad creatives from your self-hosted GitHub Pages JSON feed, caches them locally, plays them in-game, and logs all events (impression, click, skip, complete) directly to your Supabase database — no backend server required.

It fully replaces `AdsHolder.cs`, `JsonURLs.cs`, and `CountdownTimer.cs` with a single clean interface.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `FluxiAdsConfig.cs` | ScriptableObject | Holds Supabase credentials, shared across scenes |
| `FluxiAdsSDK.cs` | MonoBehaviour | Core SDK: fetch, cache, display ads, log events |

---

## Setup

### 1. Create the Config Asset

In Unity, go to:

```
Assets → Create → FluxiAds → Ads Config
```

This creates a `FluxiAdsConfig` ScriptableObject asset. Fill in:

| Field | Value |
|-------|-------|
| Supabase URL | `https://fteopoguabbydprwoyxv.supabase.co` |
| Supabase Anon Key | Your anon key from Supabase dashboard |

> Store this asset in `Assets/Resources/` or assign it directly in the Inspector. Do not hardcode credentials in scripts.

---

### 2. Add SDK to a GameObject

Create or select a persistent GameObject (e.g. `AdsManager`) and attach `FluxiAdsSDK.cs`.

Fill in the Inspector fields:

| Field | Description |
|-------|-------------|
| **Game ID** | Your game's UUID from the Supabase `games` table |
| **Game Slug** | The slug for your game (used to fetch the JSON URL) |
| **Rewarded Ad ID** | UUID of the rewarded ad from the Supabase `ads` table |
| **Interstitial Ad ID** | UUID of the interstitial ad from the Supabase `ads` table |
| **Fluxi Ads Config** | Drag the `FluxiAdsConfig` asset here |
| **On Rewarded Complete** | UnityEvent — wire up your reward callback here |

---

## How It Works

### Startup Flow

```
Awake()
  └── Load FluxiAdsConfig credentials

Start()
  └── FetchAdsManifest()
        └── GET https://novagames911.github.io/FluxiAds/api/{gameSlug}.json
              ├── Parse RewardedAds.mediaPacks → find entry where id == rewardedAdId
              └── Parse InterstitialAds.mediaPacks → find entry where id == interstitialAdId
                    └── DownloadAndCache(videoURL, imageURL)
                          └── Saved to Application.persistentDataPath/FluxiAds/
```

### Ad Display Flow

```
ShowRewardedAd()
  ├── Load cached video from disk
  ├── Play video fullscreen with countdown
  ├── POST impression event to Supabase
  └── On finish:
        ├── Player watched fully → POST complete → Invoke OnRewardedComplete
        └── Player skipped (if allowed) → POST skip

ShowInterstitialAd()
  ├── Load cached image from disk
  ├── Display fullscreen with close button
  ├── POST impression event to Supabase
  └── On interaction:
        ├── Tap/click on ad → POST click → open webURL
        └── Close button → POST skip
```

---

## Event Logging

All events are logged via direct POST to Supabase REST API. No server required.

```
POST {supabaseUrl}/rest/v1/events
Headers:
  apikey: {supabaseAnonKey}
  Content-Type: application/json

Body:
{
  "ad_id":   "uuid",
  "game_id": "uuid",
  "type":    "impression" | "click" | "skip" | "complete"
}
```

### Event Types

| Event | Trigger |
|-------|---------|
| `impression` | Ad begins showing (video starts playing / image appears) |
| `click` | User taps the interstitial image ad |
| `complete` | Rewarded video watched to the end |
| `skip` | User closes ad before completion |

---

## UnityEvent Callbacks

Wire these in the Inspector or via code:

```csharp
// Reward the player after a completed rewarded ad
adsSDK.OnRewardedComplete.AddListener(() => {
    playerCoins += 100;
    Debug.Log("Player rewarded!");
});
```

---

## JSON Feed Format

The SDK reads from:

```
https://novagames911.github.io/FluxiAds/api/{gameSlug}.json
```

Expected format:

```json
{
  "RewardedAds": {
    "mixAds": true,
    "mediaPacks": [
      {
        "id": "uuid",
        "videoURL": "https://...",
        "imageURL": "https://...",
        "webURL":   "https://...",
        "priority": 1
      }
    ]
  },
  "InterstitialAds": {
    "mixAds": true,
    "mediaPacks": [
      {
        "id": "uuid",
        "imageURL": "https://...",
        "webURL":   "https://...",
        "priority": 1
      }
    ]
  }
}
```

The SDK finds the ad pack whose `id` matches `rewardedAdId` or `interstitialAdId` set in the Inspector.

---

## Local Cache

Downloaded assets are stored at:

```
Application.persistentDataPath/FluxiAds/{adId}_video.mp4
Application.persistentDataPath/FluxiAds/{adId}_image.png
```

On next launch, if cached files exist and are less than 24 hours old, the network download is skipped.

---

## Replacing Legacy Scripts

| Legacy Script | Replaced By |
|---------------|-------------|
| `AdsHolder.cs` | `FluxiAdsSDK.cs` |
| `JsonURLs.cs` | Built into `FluxiAdsSDK.cs` (FetchAdsManifest) |
| `CountdownTimer.cs` | Built into `FluxiAdsSDK.cs` (ShowRewardedAd countdown) |

Delete the legacy scripts after wiring up `FluxiAdsSDK`.

---

## Minimal Integration Example

```csharp
public class GameManager : MonoBehaviour
{
    [SerializeField] FluxiAdsSDK ads;

    void Start()
    {
        ads.OnRewardedComplete.AddListener(GiveReward);
    }

    public void OnWatchAdButton()
    {
        ads.ShowRewardedAd();
    }

    public void OnLevelComplete()
    {
        ads.ShowInterstitialAd();
    }

    void GiveReward()
    {
        // called automatically after player watches rewarded ad in full
        playerGems += 50;
    }
}
```

---

## Requirements

- Unity 2021.3 LTS or newer
- Unity Video Player package (built-in)
- `UnityEngine.Networking` (built-in UnityWebRequest)
- Internet access permission on Android: `INTERNET` in AndroidManifest

---

## Notes

- The SDK is self-contained. No external packages or SDKs required.
- Credentials are stored in a ScriptableObject asset, not hardcoded.
- All network calls use `UnityWebRequest` (coroutine-based, no threading issues).
- The SDK is safe to call from any scene as long as the GameObject is active.
