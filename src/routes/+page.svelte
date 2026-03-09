<script>
    import { onMount } from "svelte";
    import PlaceAutocomplete from "$lib/PlaceAutocomplete.svelte";

    // API設定 (環境変数から取得)
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // 状態管理
    let destinationName = "";
    let routeWaypoints = [];
    let routeSteps = []; // 曲がり角などのアクションポイント
    let isLoading = false;
    let errorMessage = "";
    let userLocation = { lat: 34.7024, lon: 135.4959 }; // デフォルト: 大阪駅

    // Google Maps Services
    let directionsService;

    // A-Frame ロード状態
    let aframeLoaded = false;

    // 目的地情報の表示用
    $: displayDest = destinationName || "目的地未設定";
    $: statusText =
        routeWaypoints.length > 0 ? "ルート案内中" : "目的地を検索してください";

    onMount(() => {
        // 現在地取得の試行
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                userLocation = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                };
            });
        }

        // Google Maps SDKのロードを待って初期化
        const checkGoogle = setInterval(() => {
            if (window.google && window.google.maps) {
                clearInterval(checkGoogle);
                directionsService = new google.maps.DirectionsService();
            }
        }, 100);

        // A-Frame と AR.js のロードを待機
        const checkAFRAME = setInterval(() => {
            if (window.AFRAME) {
                clearInterval(checkAFRAME);
                aframeLoaded = true;
            }
        }, 100);
    });

    async function handlePlaceSelected(event) {
        const { lat, lon, name } = event.detail;
        destinationName = name;
        await fetchRoute(lat, lon);
    }

    async function fetchRoute(destLat, destLon) {
        if (!directionsService) {
            errorMessage = "Google Maps API がロードされていません。";
            return;
        }

        isLoading = true;
        errorMessage = "";
        routeWaypoints = [];

        try {
            const request = {
                origin: new google.maps.LatLng(
                    userLocation.lat,
                    userLocation.lon,
                ),
                destination: new google.maps.LatLng(destLat, destLon),
                travelMode: google.maps.TravelMode.WALKING,
            };

            directionsService.route(request, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK) {
                    // 経路の座標を抽出 (地上リボン用)
                    const path = result.routes[0].overview_path;
                    routeWaypoints = path.map((point) => ({
                        lat: point.lat(),
                        lon: point.lng(),
                    }));

                    // 曲がり角（ステップ）を抽出 (矢印用)
                    const legs = result.routes[0].legs[0];
                    routeSteps = legs.steps.map((step) => ({
                        lat: step.start_location.lat(),
                        lon: step.start_location.lng(),
                        instruction: step.instructions,
                        maneuver: step.maneuver,
                    }));

                    isLoading = false;
                } else {
                    throw new Error("ルートの取得に失敗しました: " + status);
                }
            });
        } catch (e) {
            errorMessage = e.message;
            console.error(e);
            isLoading = false;
        }
    }
</script>

<svelte:head>
    <title>NaviLine - ハイブリッドARナビ</title>
    <!-- A-Frame & AR.js -->
    <script src="https://aframe.io/releases/1.4.2/aframe.min.js"></script>
    <script
        src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js"
    ></script>
    <!-- Google Maps API -->
    <script
        src="https://maps.googleapis.com/maps/api/js?key={GOOGLE_MAPS_API_KEY}&libraries=places"
    ></script>
</svelte:head>

<div class="ar-container">
    {#if aframeLoaded}
        <!-- AR Scene (Always GPS) -->
        <a-scene
            embedded
            vr-mode-ui="enabled: false"
            arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
            renderer="antialias: true; alpha: true;"
            device-orientation-permission-ui="enabled: false"
        >
            <a-camera
                gps-camera="maxDistance: 2000; minDistance: 1;"
                rotation-reader
                far="3000"
            ></a-camera>

            <!-- ルート上の道しるべ (ネオンブルーの小球) -->
            {#each routeWaypoints as point, i}
                <a-entity
                    gps-entity-place="latitude: {point.lat}; longitude: {point.lon};"
                    position="0 -1.5 0"
                >
                    <a-sphere
                        radius="0.4"
                        material="color: #00FFFF; opacity: 0.8; transparent: true; emissive: #00FFFF; emissiveIntensity: 2"
                        animation="property: scale; to: 1.2 1.2 1.2; dir: alternate; dur: 1000; loop: true; easing: easeInOutSine"
                    ></a-sphere>
                </a-entity>
            {/each}

            <!-- 曲がり角の巨大矢印 (マリオカート風) -->
            {#each routeSteps as step}
                <a-entity
                    gps-entity-place="latitude: {step.lat}; longitude: {step.lon};"
                    position="0 2 0"
                >
                    <a-image
                        src="/chevron.png"
                        width="5"
                        height="5"
                        look-at="[gps-camera]"
                        animation="property: position; to: 0 3 0; dir: alternate; dur: 1000; loop: true; easing: easeInOutSine"
                    ></a-image>
                </a-entity>
            {/each}

            {#if routeWaypoints.length > 0}
                <!-- 最終目的地のゴールポスト -->
                <a-entity
                    gps-entity-place="latitude: {routeWaypoints[
                        routeWaypoints.length - 1
                    ].lat}; longitude: {routeWaypoints[
                        routeWaypoints.length - 1
                    ].lon};"
                    position="0 0 0"
                >
                    <a-cylinder
                        radius="0.5"
                        height="30"
                        position="0 15 0"
                        material="color: #ff3366; opacity: 0.3; transparent: true; emissive: #ff3366"
                    ></a-cylinder>
                    <a-entity
                        geometry="primitive: torus; radius: 4; radiusTubular: 0.3"
                        material="color: #ff3366; emissive: #ff3366"
                        position="0 15 0"
                        animation="property: rotation; to: 360 360 0; loop: true; dur: 5000"
                    ></a-entity>
                </a-entity>
            {/if}
        </a-scene>
    {:else}
        <div class="loading-screen">
            <div class="spinner"></div>
            <p>AR エンジンを起動中...</p>
        </div>
    {/if}
</div>

<!-- Modern UI Overlay (Apple Style) -->
<div class="ui-overlay">
    <!-- Top Search Area -->
    <header class="top-nav">
        <div class="search-container">
            <PlaceAutocomplete on:select={handlePlaceSelected} />
            {#if isLoading}
                <div class="loader"></div>
            {/if}
        </div>
    </header>

    <!-- Bottom Status Area (Ultra-Slim Bar) -->
    <footer class="bottom-nav">
        <div class="slim-bar">
            <div class="dest-badge">
                <span class="dot"></span>
                <span class="value">{displayDest}</span>
            </div>
            <div class="status-badge">
                <p class="value-small">{statusText}</p>
            </div>
        </div>
    </footer>
</div>

<style>
    :global(html),
    :global(body) {
        margin: 0;
        padding: 0;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background-color: #000;
        position: fixed;
    }

    /* AR.js and A-Frame forced full-screen */
    :global(video),
    :global(canvas) {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        object-fit: cover !important;
        z-index: 0 !important;
    }

    :global(body) {
        font-family:
            "Inter",
            -apple-system,
            sans-serif;
    }

    .ar-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 1;
    }

    .ui-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-sizing: border-box;
        /* iPhone Notch Support */
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
    }

    /* Top Nav (Search Bar) */
    .top-nav {
        padding: 24px;
        background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.4) 0%,
            transparent 100%
        );
        pointer-events: auto;
    }

    .search-container {
        max-width: 600px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 20px;
        padding: 8px 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    /* Bottom Nav (Ultra-Slim Bar) */
    .bottom-nav {
        padding: 0 16px 16px 16px;
        pointer-events: auto;
    }

    .slim-bar {
        max-width: 600px;
        height: 54px;
        margin: 0 auto;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 40px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        color: white;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }

    .dest-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 60%;
    }

    .dot {
        width: 8px;
        height: 8px;
        background: #00d2ff;
        border-radius: 50%;
        box-shadow: 0 0 10px #00d2ff;
        flex-shrink: 0;
    }

    .value {
        font-size: 1rem;
        font-weight: 700;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .value-small {
        font-size: 0.85rem;
        font-weight: 500;
        margin: 0;
        color: rgba(255, 255, 255, 0.7);
    }

    .loader {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top-color: #00d2ff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .loading-screen {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: black;
        color: white;
        z-index: 20;
    }

    .spinner {
        width: 44px;
        height: 44px;
        border: 4px solid rgba(255, 255, 255, 0.1);
        border-top-color: #00d2ff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 24px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* AR.js cleanup */
    :global(.a-canvas) {
        z-index: 1 !important;
    }
</style>
