<script setup lang="ts">
import {computed, ref} from 'vue';
import { IonContent, IonHeader, IonPage, IonToolbar, IonIcon, IonBackButton, IonButton, IonFooter, IonTitle, IonButtons, IonText } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  checkmarkOutline,
  arrowForwardOutline,
  timeOutline,
  receiptOutline,
  ellipsisHorizontal
} from 'ionicons/icons';
import { useEpocStore } from '@/stores/epocStore';
import VideoPlayer from '@/components/VideoPlayer.vue';
import { Capacitor } from '@capacitor/core';
import { storeToRefs } from 'pinia';
import {EpocLibrary} from '@/types/epoc';
import { displayLicence } from '@/utils/app';

const { t } = useI18n();

const epocStore = useEpocStore();
const router = useRouter();
const selectedTab = ref(0);
const { epoc } = storeToRefs(epocStore);

const teaserSubtitles = computed(() => {
  if (!epoc.value?.teaserSubtitles) return [];
  return epoc.value?.teaserSubtitles.map((item) => {
    const newItem = JSON.parse(JSON.stringify(item));
    newItem.src = pathToUrl(item.src)
    return newItem;
  })
})

const selectTab = (index: number) => {
    selectedTab.value = index;
};

const pathToUrl = (path: string) => {
    if (path.startsWith('file://') || path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    } else {
        return Capacitor.convertFileSrc(`${epoc.value?.dir}/${path}`);
    }
};
</script>

<template>
    <ion-page>
        <ion-header class="mobile-only" :translucent="true">
            <ion-toolbar>
                <ion-title>{{ t('OVERVIEW_PAGE.PRESENTATION') }}</ion-title>
                <ion-buttons class="mobile-only" slot="end">
                  <ion-button :aria-label="t('MISSING.OPTIONS')" v-on:click="epocStore.epocMainMenu()">
                  <ion-icon aria-hidden="true" :icon="ellipsisHorizontal" color="inria-icon"></ion-icon>
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
        </ion-header>

        <ion-content v-if="epoc">
            <div class="wrapper">
                <div class="epoc-title">
                    <h3>{{ epoc.title }}</h3>
                </div>

                <div class="epoc-trailer">
                    <video-player
                        v-if="epoc.teaser"
                        :src="pathToUrl(epoc.teaser)"
                        :poster="pathToUrl(epoc.thumbnail)"
                        :controls="{ show: false, timeline: true, overlay: true, subtitles: true }"
                        :subtitles="teaserSubtitles"
                    >
                    </video-player>
                    <img v-else :alt="'Cover image : ' + epoc.title" :src="pathToUrl(epoc.thumbnail)" />
                </div>

                <div class="epoc-specs">
                    <div class="epoc-spec" v-if="epoc.objectives && epoc.objectives.length > 0">
                        <div class="epoc-spec-icon"><ion-icon aria-hidden="true" :icon="checkmarkOutline"></ion-icon></div>
                        <div class="epoc-spec-value">
                            {{ epoc.objectives.length }} {{ t('OVERVIEW_PAGE.OBJECTIVES', epoc.objectives.length) }}
                        </div>
                    </div>
                    <div class="epoc-spec">
                        <div class="epoc-spec-icon"><ion-icon aria-hidden="true" :icon="timeOutline"></ion-icon></div>
                        <div
                            role="img"
                            aria-roledescription="Temps"
                            :aria-label="(epoc.duration || epoc.chapterDuration*epoc.chaptersCount || 60)+t('OVERVIEW_PAGE.MIN_MODULE')"
                            class="epoc-spec-value"
                        >
                            {{ epoc.duration || epoc.chapterDuration*epoc.chaptersCount || 60 }} {{ t('OVERVIEW_PAGE.MIN_MODULE') }}
                        </div>
                    </div>
                    <div class="epoc-spec epoc-spec-clickable" role="button" :aria-label="t('OVERVIEW_PAGE.LICENSE')" @click="displayLicence(epoc)">
                        <div class="epoc-spec-icon"><ion-icon aria-hidden="true" :icon="receiptOutline"></ion-icon></div>
                        <div class="epoc-spec-value">
                            {{ epoc.license?.name || t('OVERVIEW_PAGE.NO_LICENSE') }}
                        </div>
                    </div>
                </div>

                <div class="tabs-headers">
                    <div
                        role="tab"
                        :aria-selected="selectedTab === 0"
                        class="tabs-header"
                        v-on:click="selectTab(0)"
                        :class="selectedTab === 0 ? 'selected' : ''"
                    >
                        <span>{{ t('OVERVIEW_PAGE.RESUME') }}</span>
                    </div>
                    <div
                        role="tab"
                        :aria-selected="selectedTab === 1"
                        class="tabs-header"
                        v-on:click="selectTab(1)"
                        :class="selectedTab === 1 ? 'selected' : ''"
                    >
                        <span>{{ t('OVERVIEW_PAGE.OBJECTIVES', epoc.objectives.length) }}</span>
                    </div>
                    <div
                        v-if="epoc.prerequisites"
                        role="tab"
                        :aria-selected="selectedTab === 3"
                        class="tabs-header"
                        v-on:click="selectTab(3)"
                        :class="selectedTab === 3 ? 'selected' : ''"
                    >
                        <span>{{ t('OVERVIEW_PAGE.PREREQUISITES') }}</span>
                    </div>
                    <div
                        role="tab"
                        :aria-selected="selectedTab === 2"
                        class="tabs-header"
                        v-on:click="selectTab(2)"
                        :class="selectedTab === 2 ? 'selected' : ''"
                    >
                        <span>{{ t('OVERVIEW_PAGE.AUTHORS') }}</span>
                    </div>
                </div>
                <div class="tabs">
                    <div class="tab" v-if="selectedTab === 0">
                        <ion-text class="html-text" :innerHTML="epoc.summary"></ion-text>
                    </div>
                    <div class="tab" v-if="selectedTab === 1">
                        <div class="course-objective" v-for="objective of epoc.objectives">
                            <div class="course-objective-icon">
                                <ion-icon aria-hidden="true" :icon="checkmarkOutline"></ion-icon>
                            </div>
                            <ion-text>{{ objective }}</ion-text>
                        </div>
                    </div>
                    <div class="tab" v-if="selectedTab === 3">
                        <div class="course-prerequisites" v-for="prerequisite of epoc.prerequisites">
                            <div class="course-prerequisites-icon">
                                <ion-icon aria-hidden="true" :icon="arrowForwardOutline"></ion-icon>
                            </div>
                            <ion-text>{{ prerequisite }}</ion-text>
                        </div>
                    </div>
                    <div class="tab" v-if="selectedTab === 2">
                        <div class="epoc-author" v-for="author of epoc.authors">
                            <div class="epoc-author-name">
                                <img
                                    :alt="t('OVERVIEW_PAGE.PICTURE_ALT') + author.name"
                                    v-if="author.image"
                                    :src="pathToUrl(author.image)"
                                />
                                <div>
                                    {{ author.name }}
                                    <div class="epoc-author-title">{{ author.title }}</div>
                                </div>
                            </div>
                            <div class="epoc-author-description html-text" :innerHTML="author.description"></div>
                        </div>
                    </div>
                </div>
            </div>
        </ion-content>

        <ion-footer mode="ios" v-if="epoc">
            <ion-toolbar>
              <div class="wrapper">
                <ion-button
                    role="button"
                    class="start-course"
                    size="large"
                    expand="block"
                    color="inria"
                    strong
                    @click="router.push(`/epoc/toc/${epoc.id}`)"
                >
                    <span>{{ $t('OVERVIEW_PAGE.GO') }}</span>
                </ion-button>
              </div>
            </ion-toolbar>
        </ion-footer>
    </ion-page>
</template>

<style scoped lang="scss">
.wrapper {
    max-width: 600px;
    margin: auto;
}

.epoc-title {
    padding: 1rem;
    text-align: center;
    h3 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: bold;
        line-height: 2rem;

        &:after {
            content: '';
            display: block;
            width: 80px;
            height: 4px;
            margin: 10px auto;
            border-radius: 2px;
            background: var(--ion-color-inria);
        }
    }
}

.epoc-trailer {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-top: 1px solid var(--ion-color-inria-light);
    border-bottom: 1px solid var(--ion-color-inria-light);
    // hack to fix overflow hidden safari
    -webkit-mask-image: -webkit-radial-gradient(white, black);
    background: var(--ion-color-inria-blue);

    img,
    .video-player {
        display: flex;
        min-height: 210px;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        object-fit: cover;
        color: white;
    }
}

.tabs {
    padding: 1rem;
}

.course-objective,
.course-prerequisites {
    display: flex;
    margin-bottom: 10px;

    &-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        width: 2rem;
        height: 2rem;
        margin-right: 1rem;
        border-radius: 0.8rem;
        color: var(--ion-color-inria);
        background: var(--ion-color-item);
    }

    ion-text {
        display: inline-block;
        vertical-align: middle;
        width: calc(100% - 3em);
    }
}

ion-footer ion-toolbar,
ion-footer.footer-toolbar-padding ion-toolbar:last-of-type {
    padding: 1rem 1rem calc(1rem + var(--ion-safe-area-bottom, 0)) 1rem;
    box-shadow: 0 -6px 14px 0 var(--ion-color-shadow);
    display: flex;
    justify-content: center;
}

.footer-toolbar ion-button {
    max-width: 25rem;
    margin: auto;
}
</style>
