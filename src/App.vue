<script setup lang="ts">
import {IonApp, IonContent, IonMenu, IonRouterOutlet, IonSplitPane} from '@ionic/vue';
import WebSidebar from './components/WebSidebar.vue';
import DetachedAudioPlayer from './components/DetachedAudioPlayer.vue';
import DetachedVideoPlayer from './components/DetachedVideoPlayer.vue';
import {StatusBar} from '@capacitor/status-bar';
import {Capacitor, registerPlugin, SystemBars, SystemBarsStyle, SystemBarType} from '@capacitor/core';
import {Device} from '@capacitor/device';
import {register} from 'swiper/element/bundle';
import {useSettingsStore} from './stores/settingsStore';
import {nextTick, onMounted, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {App} from '@capacitor/app';
import {useRouter} from 'vue-router';
import {confirmOpen} from '@/composables/useQr';

const settingsStore = useSettingsStore();
const router = useRouter();

register();

function getSystemTheme(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: 'light' | 'dark' | 'auto'): 'light' | 'dark' {
    return theme === 'auto' ? getSystemTheme() : theme;
}

function applyTheme(theme: 'light' | 'dark') {
    document.documentElement.setAttribute('color-scheme', theme);
}

// Local Android plugin (android/app/src/main/java/fr/inria/epoc/ThemeBarsPlugin.java)
const ThemeBars = registerPlugin<{
  setBackgroundColor(options: { color: string }): Promise<void>
}>('ThemeBars');

type AndroidBarsMode = 'legacy' | 'padded' | 'edge-to-edge';

async function getAndroidBarsMode(): Promise<AndroidBarsMode | null> {
    if (Capacitor.getPlatform() !== 'android') return null;
    const { androidSDKVersion, webViewVersion } = await Device.getInfo();
    // Android 15 (API 35) and above enforce edge-to-edge: system bars are transparent and drawn over the webview
    if ((androidSDKVersion ?? 35) < 35) return 'legacy';
    const webViewMajorVersion = parseInt(webViewVersion, 10);
    // Below this WebView version, Capacitor pads the webview instead of drawing it behind the system bars
    if (webViewMajorVersion < 140) return 'padded';
    return 'edge-to-edge';
}


async function applyStatusBarStyle(theme: 'light' | 'dark') {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const style = theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
      const color = theme === 'dark' ? '#17191A' : '#FFFFFF';
      const androidBarsMode = await getAndroidBarsMode();
      if (androidBarsMode === 'padded') {
        await SystemBars.setStyle({ style });
        await ThemeBars.setBackgroundColor({ color });
      } else if (androidBarsMode === 'legacy') {
        const statusBarInfo: any = await StatusBar.getInfo();
        document.documentElement.style.setProperty('--ion-safe-area-top', `${statusBarInfo.height}px`);
        // Before edge-to-edge, the status bar has its own opaque background and the navigation bar keeps the system color
        await SystemBars.setStyle({ style, bar: SystemBarType.StatusBar });
        await StatusBar.setBackgroundColor({ color });
      } else {
        await SystemBars.setStyle({ style });
      }
    } catch (e) {
        console.warn('Unable to apply system bars style', e);
    }
}

function loadTheme(theme: 'light' | 'dark' | 'auto') {
    const resolvedTheme = resolveTheme(theme);
    applyTheme(resolvedTheme);
    applyStatusBarStyle(resolvedTheme);
}

const { locale } = useI18n();

onMounted(async () => {
    await nextTick();
    loadTheme(settingsStore.settings.theme);
    locale.value = settingsStore.settings.lang;

    await App.addListener('appUrlOpen', (event) => {
      const urlOpen = new URL(event.url);
      const slug = urlOpen.pathname.replace('/app-redirect', '');
      if (slug === '/dl') {
        // e.g. https://epoc.inria.fr/app-redirect/dl?url=https://example.com/epoc.zip
        const url = urlOpen.searchParams.get('url');
        if (url) confirmOpen(url);
      } else if (slug) {
        // e.g. https://epoc.inria.fr/app-redirect/settings → navigate to /settings
        router.push(slug);
      }
    });
});

watch(
    () => settingsStore.settings.theme,
    (newTheme) => {
        loadTheme(newTheme);
    }
);

watch(
    () => settingsStore.settings.lang,
    (newLang) => {
        locale.value = newLang;
    }
);
</script>
<template>
    <ion-app>
        <DetachedAudioPlayer />
        <DetachedVideoPlayer />
        <ion-split-pane content-id="main-content" when="(min-width: 900px)">
            <ion-menu content-id="main-content" class="web-nav-menu" :swipe-gesture="false">
                <ion-content>
                    <WebSidebar />
                </ion-content>
            </ion-menu>
            <ion-router-outlet id="main-content" class="detached-offset-top"></ion-router-outlet>
        </ion-split-pane>
    </ion-app>
</template>

<style scoped lang="scss">
  ion-menu {
    max-width: 300px;
    --border: 1px solid var(--ion-color-item);
  }

  .detached-offset-top {
    top: var(--detached-audio-player-offset, 0px);
  }
</style>
