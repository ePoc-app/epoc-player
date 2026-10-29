import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import App from './App.vue';
import router from './router';

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { IonicVue } from '@ionic/vue';
import { useStorage } from '@/composables/useStorage';
import VueMatomo from 'vue-matomo';
import { scormInit } from '@/scorm';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
import '@ionic/vue/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.scss';

if ('serviceWorker' in navigator && Capacitor.getPlatform() === 'web' && import.meta.env.VITE_APP_MODE !== 'preview') {
    const registration = navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('ServiceWorker registered:', registration);
        init();
    }).catch((error) => {
        console.error('ServiceWorker registration failed:', error);
    });
} else {
    init();
}

function init() {
    const pinia = createPinia();

    // No-op outside of an LMS
    scormInit();

    const app = createApp(App)
        .use(IonicVue, {
            innerHTMLTemplatesEnabled: true,
            swipeBackEnabled: false
        })
        .use(i18n)
        .use(pinia)
        .use(router)

    // Matomo setup NOT in development
    app.use(VueMatomo, {
        host: 'https://piwik.inria.fr',
        siteId: 133,
        enableLinkTracking: true,
        debug: false,
        // Disable auto-tracking to avoid scheme issues
        router: null,
        trackInitialView: false
    });

    router.isReady().then(async () => {
        // Preload Filesystem to prevent error on first load
        if (Capacitor.getPlatform() === 'web') {
            await Filesystem.readdir({ path: '', directory: Directory.LibraryNoCloud }).catch(() => undefined);
        }
        app.mount('#app');
        useStorage();
    });
}
