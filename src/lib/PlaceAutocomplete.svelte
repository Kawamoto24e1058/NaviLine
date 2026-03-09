<script>
    import { createEventDispatcher, onMount } from "svelte";

    const dispatch = createEventDispatcher();

    let query = "";
    let suggestions = [];
    let showSuggestions = false;
    let autocompleteService;
    let placesService;
    let sessionToken;

    onMount(() => {
        // googleオブジェクトがロードされるのを待つ（親でロードされている前提）
        const checkGoogle = setInterval(() => {
            if (
                window.google &&
                window.google.maps &&
                window.google.maps.places
            ) {
                clearInterval(checkGoogle);
                initAutocomplete();
            }
        }, 100);
    });

    function initAutocomplete() {
        autocompleteService = new google.maps.places.AutocompleteService();
        placesService = new google.maps.places.PlacesService(
            document.createElement("div"),
        );
        sessionToken = new google.maps.places.AutocompleteSessionToken();
    }

    async function handleInput() {
        if (!query || query.length < 2) {
            suggestions = [];
            showSuggestions = false;
            return;
        }

        if (!autocompleteService) return;

        autocompleteService.getPlacePredictions(
            {
                input: query,
                sessionToken: sessionToken,
                // 必要に応じて言語や地域を制限
                // componentRestrictions: { country: 'jp' }
            },
            (predictions, status) => {
                if (
                    status === google.maps.places.PlacesServiceStatus.OK &&
                    predictions
                ) {
                    suggestions = predictions;
                    showSuggestions = true;
                } else {
                    suggestions = [];
                    showSuggestions = false;
                }
            },
        );
    }

    function selectSuggestion(suggestion) {
        query = suggestion.description;
        showSuggestions = false;

        if (!placesService) return;

        placesService.getDetails(
            {
                placeId: suggestion.place_id,
                fields: ["geometry", "name", "formatted_address"],
                sessionToken: sessionToken,
            },
            (place, status) => {
                if (
                    status === google.maps.places.PlacesServiceStatus.OK &&
                    place.geometry
                ) {
                    const lat = place.geometry.location.lat();
                    const lon = place.geometry.location.lng();

                    console.log(`Selected: ${place.name}`);
                    console.log(`Latitude: ${lat}, Longitude: ${lon}`);

                    dispatch("select", {
                        name: place.name,
                        address: place.formatted_address,
                        lat,
                        lon,
                    });

                    // 新しいセッショントークンを発行
                    sessionToken =
                        new google.maps.places.AutocompleteSessionToken();
                }
            },
        );
    }

    function handleClickOutside(e) {
        // ドロップダウンの外をクリックした時に閉じる処理が必要な場合はここに追加
    }
    function handleKeydown(e, suggestion) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectSuggestion(suggestion);
        }
    }
</script>

<div class="autocomplete-container">
    <input
        type="text"
        placeholder="行きたい場所を検索..."
        bind:value={query}
        on:input={handleInput}
        on:focus={() => query.length >= 2 && (showSuggestions = true)}
    />

    {#if showSuggestions && suggestions.length > 0}
        <ul class="suggestions-list" role="listbox">
            {#each suggestions as suggestion}
                <li
                    on:click={() => selectSuggestion(suggestion)}
                    on:keydown={(e) => handleKeydown(e, suggestion)}
                    role="option"
                    aria-selected="false"
                    tabindex="0"
                >
                    <span class="main-text"
                        >{suggestion.structured_formatting.main_text}</span
                    >
                    <span class="secondary-text"
                        >{suggestion.structured_formatting.secondary_text}</span
                    >
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .autocomplete-container {
        position: relative;
        width: 100%;
    }

    input {
        width: 100%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 12px 16px;
        color: white;
        font-size: 0.9rem;
        outline: none;
        box-sizing: border-box;
    }

    .suggestions-list {
        position: absolute;
        top: 110%;
        left: 0;
        width: 100%;
        background: rgba(30, 30, 30, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        margin: 0;
        padding: 8px 0;
        list-style: none;
        z-index: 1000;
        max-height: 250px;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }

    li {
        padding: 10px 16px;
        cursor: pointer;
        transition: background 0.2s;
        display: flex;
        flex-direction: column;
    }

    li:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .main-text {
        color: white;
        font-size: 0.9rem;
        font-weight: 600;
    }

    .secondary-text {
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.75rem;
    }
</style>
