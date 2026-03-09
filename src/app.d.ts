/// <reference types="@sveltejs/kit" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }

    interface ImportMetaEnv {
        readonly VITE_GOOGLE_MAPS_API_KEY: string;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }
}

export { };
