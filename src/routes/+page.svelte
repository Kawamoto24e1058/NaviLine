<script>
    import { onMount } from "svelte";
    import PlaceAutocomplete from "$lib/PlaceAutocomplete.svelte";

    // モード管理
    let isOutdoorMode = false;

    // API設定 (環境変数から取得)
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // 状態管理
    let destinationName = "";
    let routeWaypoints = [];
    let isLoading = false;
    let errorMessage = "";
    let userLocation = { lat: 34.7024, lon: 135.4959 }; // デフォルト: 大阪駅

    // Google Maps Services
    let directionsService;

    // A-Frame ロード状態
    let aframeLoaded = false;

    // 目的地情報の表示用
    $: displayDest = isOutdoorMode
        ? destinationName || "未設定"
        : "2階のcomomoスペース";
    $: distanceText = isOutdoorMode
        ? routeWaypoints.length > 0
            ? "ルート表示中"
            : "検索してください"
        : "約 15m";

    // 屋内用経路データ (静的)
    const indoorPathPoints = [
        { x: 0, y: -0.5, z: -1, color: "#007bff" },
        { x: 0.5, y: -0.5, z: -2, color: "#0096ff" },
        { x: 1, y: -0.5, z: -3, color: "#00b4ff" },
        { x: 0.8, y: -0.5, z: -4, color: "#00d2ff" },
        { x: 0.2, y: -0.5, z: -5, color: "#00f0ff" },
        { x: -0.5, y: -0.5, z: -6, color: "#00ffcc" },
        { x: -1, y: -0.5, z: -7, color: "#00ff99" },
        { x: -0.8, y: -0.5, z: -8, color: "#33ff66" },
    ];

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
                    // 経路の座標を抽出
                    const path = result.routes[0].overview_path;

                    // 表示を軽くするために間引きを行う
                    routeWaypoints = path
                        .filter((_, i) => i % 2 === 0)
                        .map((point) => ({
                            lat: point.lat(),
                            lon: point.lng(),
                        }));

                    isOutdoorMode = true;
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

    function toggleMode() {
        isOutdoorMode = !isOutdoorMode;
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
        {#if isOutdoorMode}
            <!-- 屋外モード (GPS) -->
            <a-scene
                embedded
                vr-mode-ui="enabled: false"
                arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
                renderer="antialias: true; alpha: true;"
                device-orientation-permission-ui="enabled: false"
            >
                <a-camera gps-camera rotation-reader></a-camera>

                <!-- 動的なルートWaypoints -->
                {#each routeWaypoints as point, i}
                    <a-entity
                        gps-entity-place="latitude: {point.lat}; longitude: {point.lon};"
                    >
                        <a-box
                            scale="2 0.5 2"
                            material="color: #00d2ff; opacity: 0.7; emissive: #00d2ff; emissiveIntensity: 0.5"
                        ></a-box>
                        <a-text
                            value={i + 1}
                            align="center"
                            position="0 1 0"
                            scale="5 5 5"
                        ></a-text>
                    </a-entity>
                {/each}

                {#if routeWaypoints.length > 0}
                    <!-- 最終目的地に目立つピンを配置 -->
                    <a-entity
                        gps-entity-place="latitude: {routeWaypoints[
                            routeWaypoints.length - 1
                        ].lat}; longitude: {routeWaypoints[
                            routeWaypoints.length - 1
                        ].lon};"
                    >
                        <a-entity
                            geometry="primitive: torus; radius: 3; radiusTubular: 0.2"
                            material="color: #ff3366; emissive: #ff3366"
                            position="0 10 0"
                            animation="property: rotation; to: 360 360 0; loop: true; dur: 5000"
                        ></a-entity>
                    </a-entity>
                {/if}
            </a-scene>
        {:else}
            <!-- 屋内モード (Marker) -->
            <a-scene
                embedded
                arjs="sourceType: webcam; debugUIEnabled: false;"
                renderer="logarithmicDepthBuffer: true;"
                vr-mode-ui="enabled: false"
                device-orientation-permission-ui="enabled: false"
            >
                <a-marker preset="hiro">
                    <a-box
                        position="0 0.5 0"
                        material="opacity: 0.5; transparent: true; color: #4CC3D9"
                        animation="property: rotation; to: 0 360 0; loop: true; dur: 3000"
                    ></a-box>
                    <a-text value="START" align="center" position="0 1.2 0"
                    ></a-text>
                </a-marker>

                <a-entity position="0 0 0">
                    {#each indoorPathPoints as point, i}
                        <a-box
                            position="{point.x} {point.y} {point.z}"
                            scale="0.3 0.1 0.3"
                            material="color: {point.color}; emissive: {point.color}; emissiveIntensity: 0.5; opacity: 0.8; transparent: true"
                            animation="property: position; dir: alternate; dur: 2000; easing: easeInOutSine; loop: true; to: {point.x} {point.y +
                                0.1} {point.z}"
                        >
                        </a-box>
                    {/each}
                </a-entity>

                <a-entity camera></a-entity>
            </a-scene>
        {/if}
    {:else}
        <div class="loading-screen">
            <div class="spinner"></div>
            <p>AR エンジンを起動中...</p>
        </div>
    {/if}
</div>

<!-- 2D UI Overlay -->
<div class="ui-overlay">
    <div class="top-bar">
        <div class="logo">NaviLine</div>
        <div class="mode-badge" class:outdoor={isOutdoorMode}>
            {isOutdoorMode ? "屋外 GPS" : "屋内 Marker"}
        </div>
    </div>

    <div class="bottom-controls">
        <div class="nav-card">
            <div class="search-form">
                <PlaceAutocomplete on:select={handlePlaceSelected} />
                {#if isLoading}
                    <div class="loader-inline">...</div>
                {/if}
            </div>

            <div class="info">
                <div class="dest-group">
                    <span class="label">目的地</span>
                    <span class="value">{displayDest}へ</span>
                </div>
                <div class="dist-group">
                    <span class="label">ステータス</span>
                    <span class="value">{distanceText}</span>
                </div>
            </div>

            {#if errorMessage}
                <div class="error-msg">{errorMessage}</div>
            {/if}

            <div class="hint">
                {#if isOutdoorMode}
                    <p>前方の赤いピンを目指して進んでください</p>
                {:else}
                    <p>足元のブロックに沿ってお進みください</p>
                {/if}
            </div>

            <button class="toggle-btn" on:click={toggleMode}>
                {isOutdoorMode ? "屋内モードに切替" : "屋外モードに切替"}
            </button>
        </div>
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        overflow: hidden;
        background-color: #000;
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
        z-index: 10;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px;
        box-sizing: border-box;
    }

    .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: auto;
    }

    .logo {
        color: white;
        font-weight: 900;
        font-size: 1.5rem;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }

    .mode-badge {
        padding: 6px 14px;
        border-radius: 30px;
        font-size: 0.8rem;
        font-weight: 700;
        background: rgba(0, 123, 255, 0.3);
        color: #4da3ff;
        border: 1px solid rgba(0, 123, 255, 0.5);
        backdrop-filter: blur(10px);
    }

    .mode-badge.outdoor {
        background: rgba(255, 51, 102, 0.3);
        color: #ff6699;
        border-color: rgba(255, 51, 102, 0.5);
    }

    .bottom-controls {
        pointer-events: auto;
    }

    .nav-card {
        background: rgba(20, 20, 20, 0.7);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 28px;
        padding: 24px;
        color: white;
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
    }

    .info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
    }

    .label {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.6;
        margin-bottom: 4px;
    }

    .value {
        font-size: 1.2rem;
        font-weight: 800;
    }

    .hint {
        background: rgba(255, 255, 255, 0.05);
        padding: 12px 16px;
        border-radius: 16px;
        margin-bottom: 20px;
    }

    .hint p {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 500;
    }

    .toggle-btn {
        width: 100%;
        padding: 16px;
        border-radius: 18px;
        border: none;
        background: linear-gradient(135deg, #007bff, #00d2ff);
        color: white;
        font-weight: 700;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.2s;
    }

    .toggle-btn:active {
        transform: scale(0.97);
    }

    /* 検索フォームのスタイル */
    .search-form {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
    }

    .loader-inline {
        color: #00d2ff;
        font-weight: bold;
        animation: blink 1s infinite;
    }

    @keyframes blink {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.3;
        }
    }

    .error-msg {
        color: #ff4d4d;
        font-size: 0.8rem;
        margin-bottom: 15px;
        font-weight: bold;
    }

    /* AR.js cleanup */
    :global(.a-canvas) {
        z-index: 1 !important;
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
        z-index: 2;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.1);
        border-top: 4px solid #00d2ff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
</style>
