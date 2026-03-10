<script>
    import { onMount, onDestroy } from "svelte";
    import PlaceAutocomplete from "$lib/PlaceAutocomplete.svelte";

    // API設定 (環境変数から取得)
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // 状態管理
    let destinationName = "";
    let routeWaypoints = [];
    let routeSteps = []; // 曲がり角などのアクションポイント
    let isLoading = false;
    let errorMessage = "";
    let userLocation = null; // 初期値なし（許可後にセット）
    let locationReady = false;
    let showTapOverlay = false;
    let isInitialized = false;
    let selectedPlace = null; // 最後に選択された場所
    let isNavigating = false; // 案内が開始されたか

    // デバッグ・診断用データ
    let gpsTelemetry = { status: "未起動", lat: null, lon: null };
    let apiTelemetry = { status: "待機中", points: 0, steps: 0 };

    // Google Maps Services
    let directionsService;

    // A-Frame ロード状態
    let aframeLoaded = false;
    let isSceneLoaded = false; // シーン本体のマウント完了フラグ

    // 目的地情報の表示用
    $: displayDest = destinationName || "目的地未設定";
    $: statusText =
        routeWaypoints.length > 0 ? "ルート案内中" : "目的地を検索してください";

    let googleCheckInterval;
    let aframeCheckInterval;

    onMount(() => {
        // Google Maps SDKのロードを待って初期化
        googleCheckInterval = setInterval(() => {
            if (window.google && window.google.maps) {
                clearInterval(googleCheckInterval);
                directionsService = new google.maps.DirectionsService();
            }
        }, 100);

        // A-Frame と AR.js のロードを待機
        aframeCheckInterval = setInterval(() => {
            if (window.AFRAME) {
                clearInterval(aframeCheckInterval);
                aframeLoaded = true;
            }
        }, 100);

        // 初回ロード時にサイレントで位置情報を試行
        trySilentInit();
    });

    onDestroy(() => {
        if (googleCheckInterval) clearInterval(googleCheckInterval);
        if (aframeCheckInterval) clearInterval(aframeCheckInterval);
    });

    async function trySilentInit() {
        if (!navigator.geolocation) return;

        // ブラウザによってはユーザー動作がないとプロンプトすら出ない場合があるため
        // 一度極短タイムアウトで試行して、必要なら「タップ開始」を表示する
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                };
                locationReady = true;
                isInitialized = true;
            },
            (err) => {
                // 許可が必要、またはジェスチャが必要な場合
                showTapOverlay = true;
            },
            { timeout: 2000 },
        );
    }

    function handleSceneLoaded() {
        console.log("AR Scene Loaded");
        isSceneLoaded = true;
    }

    async function handleInitialInteraction() {
        if (isInitialized) return;
        showTapOverlay = false;
        isLoading = true;
        try {
            await requestLocationPerms();
            isInitialized = true;
        } catch (e) {
            errorMessage = e.message;
        } finally {
            isLoading = false;
        }
    }

    async function requestLocationPerms() {
        return new Promise((resolve, reject) => {
            // HTTPS チェック
            if (!window.isSecureContext) {
                reject(new Error("位置情報の取得にはHTTPS接続が必要です。"));
                return;
            }

            if (!navigator.geolocation) {
                reject(
                    new Error(
                        "お使いのブラウザは位置情報をサポートしていません。",
                    ),
                );
                return;
            }

            gpsTelemetry.status = "取得中...";
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLocation = {
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                    };
                    gpsTelemetry = {
                        status: "成功",
                        lat: pos.coords.latitude.toFixed(6),
                        lon: pos.coords.longitude.toFixed(6),
                    };
                    locationReady = true;
                    resolve(userLocation);
                },
                (err) => {
                    let msg = "位置情報の取得に失敗しました。";
                    if (err.code === 1)
                        msg = "位置情報の利用を許可してください。";

                    // タイムアウトなどのエラーでも、既存のキャッシュがあれば「成功扱いのステータス」にする準備
                    gpsTelemetry.status = `取得エラー: ${err.message} (コード: ${err.code})`;
                    reject(new Error(msg));
                },
                {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 60000,
                },
            );
        });
    }

    async function handlePlaceSelected(event) {
        selectedPlace = event.detail;
        destinationName = selectedPlace.name;
        errorMessage = "";
        routeWaypoints = []; // 以前のルートをクリア
        isNavigating = false;
    }

    async function startNavigation() {
        if (!selectedPlace) return;

        errorMessage = "";
        isLoading = true;

        try {
            // 1. 位置情報の取得を試行
            try {
                await requestLocationPerms();
            } catch (e) {
                // 取得に失敗（タイムアウト等）しても、キャッシュがあれば続行する
                if (userLocation) {
                    console.warn(
                        "GPS取得失敗。キャッシュされた座標で続行します:",
                        e.message,
                    );
                    gpsTelemetry.status = "成功 (キャッシュ利用)";
                } else {
                    // キャッシュもない場合は本当のエラー
                    throw e;
                }
            }
            // 2. 取得した現在地を起点にルート検索 (userLocation があることが保証されている)
            await fetchRoute(selectedPlace.lat, selectedPlace.lon);
            isNavigating = true;
        } catch (e) {
            errorMessage = e.message;
        } finally {
            isLoading = false;
        }
    }

    async function fetchRoute(destLat, destLon) {
        if (!directionsService) {
            errorMessage = "Google Maps API がロードされていません。";
            return;
        }
        if (!userLocation) {
            errorMessage = "現在地が取得できていません。";
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

            apiTelemetry.status = "リクエスト中...";
            directionsService.route(request, (result, status) => {
                isLoading = false;
                apiTelemetry.status = status;

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

                    apiTelemetry.points = routeWaypoints.length;
                    apiTelemetry.steps = routeSteps.length;
                } else {
                    errorMessage = "ルートの取得に失敗しました: " + status;
                    if (status === "REQUEST_DENIED") {
                        errorMessage +=
                            " (APIキーの設定または制限を確認してください)";
                    }
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
    {#if aframeLoaded && locationReady}
        <!-- AR Scene (Always GPS) -->
        <a-scene
            embedded
            vr-mode-ui="enabled: false"
            arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
            renderer="antialias: true; alpha: true;"
            device-orientation-permission-ui="enabled: false"
            id="ar-scene"
            on:loaded={handleSceneLoaded}
        >
            <a-camera
                gps-camera="maxDistance: 3000; minDistance: 1;"
                rotation-reader
                far="3000"
            >
                <!-- 描画テスト用: カメラの5m前に常に表示される赤い立方体 -->
                <a-box position="0 0 -5" color="red" scale="0.5 0.5 0.5"
                ></a-box>
            </a-camera>

            {#if isSceneLoaded}
                <!-- ルート上の道しるべ (マリオカート風の巨大ネオン球) -->
                {#if routeWaypoints.length > 0}
                    {#each routeWaypoints as point}
                        <a-entity
                            gps-entity-place="latitude: {point.lat}; longitude: {point.lon};"
                        >
                            <a-sphere
                                radius="1"
                                position="0 -1.5 0"
                                scale="2 2 2"
                                material="color: #00FFFF; opacity: 0.8; transparent: true; emissive: #00FFFF; emissiveIntensity: 2"
                                animation="property: scale; to: 2.2 2.2 2.2; dir: alternate; dur: 1000; loop: true; easing: easeInOutSine"
                            ></a-sphere>
                        </a-entity>
                    {/each}

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

                <!-- 曲がり角の巨大矢印 (マリオカート風) -->
                {#if routeSteps.length > 0}
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
                {/if}
            {/if}
        </a-scene>
    {:else if isLoading}
        <div class="loading-screen">
            <div class="spinner"></div>
            {#if !locationReady}
                <p>位置情報を取得中...</p>
            {:else}
                <p>AR エンジンを起動中...</p>
            {/if}
        </div>
    {:else}
        <div class="loading-screen">
            <div class="spinner"></div>
            <p>目的地を検索してナビを開始してください</p>
        </div>
    {/if}
</div>

<!-- Modern UI Overlay (Apple Style) -->
<div class="ui-overlay">
    <!-- First Tap Guide (Invisible Trigger) -->
    {#if showTapOverlay}
        <div
            class="tap-overlay"
            on:click={handleInitialInteraction}
            on:keydown={(e) => e.key === "Enter" && handleInitialInteraction()}
            role="button"
            tabindex="0"
        >
            <div class="tap-hint">
                <div class="tap-icon">👆</div>
                <p>画面をタップしてARを開始</p>
            </div>
        </div>
    {/if}

    <!-- Error Banner (Global) -->
    {#if errorMessage}
        <div class="error-toast">
            <span class="error-pill">{errorMessage}</span>
        </div>
    {/if}

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
        <!-- Debug Diagnostics Card -->
        <div class="debug-card">
            <div class="debug-item">
                <span class="label">GPS:</span>
                <span class="val"
                    >{gpsTelemetry.status}
                    {gpsTelemetry.lat
                        ? `(${gpsTelemetry.lat}, ${gpsTelemetry.lon})`
                        : ""}</span
                >
            </div>
            <div class="debug-item">
                <span class="label">SCENE:</span>
                <span class="val {isSceneLoaded ? '' : 'err'}"
                    >{isSceneLoaded ? "READY" : "LOADING..."}</span
                >
            </div>
            <div class="debug-item">
                <span class="label">API:</span>
                <span
                    class="val {apiTelemetry.status !== 'OK' &&
                    apiTelemetry.status !== '待機中'
                        ? 'err'
                        : ''}">{apiTelemetry.status}</span
                >
            </div>
            <div class="debug-item">
                <span class="label">データ:</span>
                <span class="val"
                    >点: {apiTelemetry.points} / 角: {apiTelemetry.steps}</span
                >
            </div>
        </div>

        {#if selectedPlace && !isNavigating && !isLoading}
            <button class="start-btn" on:click={startNavigation}>
                <span class="btn-text">案内開始</span>
            </button>
        {/if}

        <div class="slim-bar">
            <div class="dest-badge">
                <span class="dot"></span>
                <span class="value">{displayDest}</span>
            </div>
            <div class="status-badge">
                <p class="value-small">
                    {statusText}
                    {#if routeWaypoints.length > 0}
                        | ポイント: {routeWaypoints.length}個
                    {/if}
                </p>
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
        height: 100dvh;
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
        height: 100dvh !important;
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
        height: 100dvh;
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

    /* Top Nav (Search Bar Area) */
    .top-nav {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        /* ノッチ領域 + 余白 */
        padding-top: calc(env(safe-area-inset-top) + 12px);
        padding-left: 24px;
        padding-right: 24px;
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

    /* Bottom Nav (Status / Start Area) */
    .bottom-nav {
        position: fixed;
        /* ホームインジケータ + 余白 */
        bottom: calc(env(safe-area-inset-bottom) + 20px);
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 400px;
        padding: 0;
        pointer-events: auto;
        z-index: 999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
    }

    .start-btn {
        width: 200px;
        height: 50px;
        background: rgba(0, 210, 255, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 210, 255, 0.5);
        border-radius: 25px;
        color: #00d2ff;
        font-size: 1.1rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 8px 32px rgba(0, 210, 255, 0.2);
        animation: floatUp 0.6s ease-out;
        transition: transform 0.2s;
    }

    .start-btn:active {
        transform: scale(0.95);
    }

    @keyframes floatUp {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
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

    /* Error Toast (Apple Style) */
    .error-toast {
        position: fixed;
        top: calc(80px + env(safe-area-inset-top));
        left: 0;
        width: 100%;
        display: flex;
        justify-content: center;
        pointer-events: none;
        z-index: 1000;
        animation: slideDown 0.4s ease-out;
    }

    .error-pill {
        background: rgba(255, 59, 48, 0.9);
        backdrop-filter: blur(10px);
        color: white;
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 0.9rem;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);
        pointer-events: auto;
    }

    @keyframes slideDown {
        from {
            transform: translateY(-20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    /* Tap to Start Overlay */
    .tap-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100dvh;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        cursor: pointer;
        pointer-events: auto;
    }

    .tap-hint {
        text-align: center;
        color: white;
        animation: pulse 2s infinite;
    }

    .tap-icon {
        font-size: 3rem;
        margin-bottom: 16px;
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 0.8;
        }
        50% {
            transform: scale(1.1);
            opacity: 1;
        }
        100% {
            transform: scale(1);
            opacity: 0.8;
        }
    }

    /* Debug Diagnostics Card */
    .debug-card {
        width: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 12px;
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
    }

    .debug-item {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        font-family: monospace;
    }

    .debug-item .label {
        color: rgba(255, 255, 255, 0.5);
    }

    .debug-item .val {
        color: #00ff00;
        text-align: right;
    }

    .debug-item .val.err {
        color: #ff3b30;
    }

    /* AR.js cleanup */
    :global(.a-canvas) {
        z-index: 1 !important;
    }
</style>
