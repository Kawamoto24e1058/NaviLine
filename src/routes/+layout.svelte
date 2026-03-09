<script>
    import { onMount } from "svelte";

    onMount(async () => {
        // PWA registration rolled back for stability to fix 404/build errors
    });
</script>

<svelte:head>
    <meta name="theme-color" content="#000000" />
</svelte:head>

<slot />
