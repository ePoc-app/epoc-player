<script setup lang="ts">
import {
  IonContent,
  IonHeader,
  IonPage,
  IonToolbar,
  IonIcon,
  IonBackButton,
  IonButton,
  IonFooter,
  IonTitle,
  IonButtons,
  IonText,
  onIonViewWillEnter,
} from '@ionic/vue';
import { useRoute, useRouter } from 'vue-router';
import {
    ellipsisHorizontal,
    checkmarkOutline,
    arrowForwardOutline,
    timeOutline,
    receiptOutline,
    cloudDownloadOutline,
    syncOutline,
    cogOutline,
} from 'ionicons/icons';
import { useLibraryStore } from '@/stores/libraryStore';
import { EpocCollection, EpocLibrary } from '@/types/epoc';
import { useI18n } from 'vue-i18n';
import { ref, computed } from 'vue';
import VideoPlayer from '@/components/VideoPlayer.vue';
import { useLocalEpocsStore } from '@/stores/localEpocsStore';
import { Capacitor } from '@capacitor/core';
import { displayLicence } from '@/utils/app';

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const libraryStore = useLibraryStore();
const localEpocStore = useLocalEpocsStore();
const selectedTab = ref(0);

const openEpocMenu = (epoc: EpocLibrary) => {
    if (route.params.libraryId === 'local-epocs') {
        localEpocStore.localEpocLibraryMenu(epoc);
    } else {
        libraryStore.epocLibraryMenu(epoc, route.params.libraryId.toString());
    }
};

const downloadEpoc = (epoc: EpocLibrary) => {
    libraryStore.downloadEpoc(epoc, route.params.libraryId.toString());
};

const getEpoc = (): EpocLibrary | undefined => {
    let epoc = undefined;
    if (route.params.libraryId === 'local-epocs') {
        epoc = localEpocStore.localEpocs.find((epoc) => epoc.id === route.params.id);
    } else if (route.params.libraryId && route.params.id) {
        const collectionId = route.params.libraryId.toString();
        const epocId = route.params.id.toString();
        epoc = getEpocFromCollection(collectionId, epocId);
    }
    return epoc;
};

const getEpocFromCollection = (collectionId: string, epocId: string): EpocLibrary | undefined => {
    const collection = getCollection(collectionId);
    if (collection && collection.ePocs[epocId]) {
        return collection.ePocs[epocId];
    }
};

const getCollection = (collectionId: string): EpocCollection | undefined => {
    const collections = { ...libraryStore.customCollections, ...libraryStore.officialCollections };
    return collections[collectionId];
};

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

const epoc = computed<EpocLibrary | undefined>(() => getEpoc());
const collectionLicense = computed(() => {
    if (!route.params.libraryId || route.params.libraryId === 'local-epocs') return undefined;

    return getCollection(route.params.libraryId.toString())?.licence;
});
const aspectRatio = ref('16/9');

const teaserSubtitles = computed(() => {
  if (!epoc.value?.teaserSubtitles) return [];
  return epoc.value?.teaserSubtitles.map((item) => {
    const newItem = JSON.parse(JSON.stringify(item));
    newItem.src = pathToUrl(item.src)
    return newItem;
  })
})

onIonViewWillEnter(() => {
  const epoc = getEpoc();

  if (!epoc || !epoc.teaser) return;

  const video = document.createElement('video');
  video.controls = true;
  video.preload = 'metadata';
  video.src = pathToUrl(epoc.teaser);
  video.load();

  video.addEventListener('loadedmetadata', () => {
    aspectRatio.value = `${video.videoWidth}/${video.videoHeight}`;
  });
});

</script>

<template>
    <ion-page>
        <ion-header class="mobile-only" :translucent="true">
            <ion-toolbar>
                <ion-back-button
                    slot="start"
                    :aria-label="$t('MISSING.RETURN')"
                    text=""
                    color="inria-icon"
                    default-href="/library"
                ></ion-back-button>
                <ion-title>{{ t('OVERVIEW_PAGE.PRESENTATION') }}</ion-title>
                <ion-buttons class="mobile-only" v-if="epoc && epoc.downloaded" slot="end">
                    <ion-button :aria-label="t('MISSING.OPTIONS')" v-on:click="openEpocMenu(epoc)">
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
                        :style="{ aspectRatio: aspectRatio }"
                        :subtitles="teaserSubtitles"
                    >
                    </video-player>
                    <img v-else :alt="epoc.title" :src="pathToUrl(epoc.image)" />
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
                    <div
                        class="epoc-spec epoc-spec-clickable"
                        role="button"
                        :aria-label="t('OVERVIEW_PAGE.LICENSE')"
                        @click="displayLicence(epoc, collectionLicense)"
                    >
                        <div class="epoc-spec-icon"><ion-icon aria-hidden="true" :icon="receiptOutline"></ion-icon></div>
                        <div class="epoc-spec-value">
                            {{ epoc.license?.name || collectionLicense?.name || t('OVERVIEW_PAGE.NO_LICENSE') }}
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
                        <div v-for="objective of epoc.objectives" :key="objective" class="course-objective">
                            <div class="course-objective-icon">
                                <ion-icon aria-hidden="true" :icon="checkmarkOutline"></ion-icon>
                            </div>
                            <ion-text>{{ objective }}</ion-text>
                        </div>
                    </div>
                    <div class="tab" v-if="selectedTab === 3">
                        <div
                            v-for="prerequisite of epoc.prerequisites"
                            :key="prerequisite"
                            class="course-prerequisites"
                        >
                            <div class="course-prerequisites-icon">
                                <ion-icon aria-hidden="true" :icon="arrowForwardOutline"></ion-icon>
                            </div>
                            <ion-text>{{ prerequisite }}</ion-text>
                        </div>
                    </div>
                    <div class="tab" v-if="selectedTab === 2">
                        <div v-for="author of epoc.authors" :key="author.name" class="epoc-author">
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
                      v-if="epoc.downloaded"
                      @click="router.push(`/epoc/toc/${epoc.id}`)"
                  >
                    <span v-if="!epoc.opened">{{ $t('OVERVIEW_PAGE.GO') }}</span>
                    <span v-if="epoc.opened">{{ $t('OVERVIEW_PAGE.CONTINUE') }}</span>
                    <ion-icon v-if="epoc.opened" :icon="arrowForwardOutline" slot="end"></ion-icon>
                  </ion-button>
                  <ion-button
                      class="expanded"
                      color="inria-contrast-button"
                      size="large"
                      expand="block"
                      @click="downloadEpoc(epoc)"
                      v-if="!epoc.downloading && !epoc.downloaded && !epoc.unzipping"
                  >
                    <ion-icon :icon="cloudDownloadOutline" slot="start"></ion-icon>
                    <span>{{ $t('OVERVIEW_PAGE.DOWNLOAD') }}</span>
                  </ion-button>
                  <ion-button
                      class="expanded"
                      size="large"
                      expand="block"
                      :disabled="true"
                      color="inria-contrast-button"
                      v-if="epoc.downloading"
                  >
                    <ion-icon :icon="syncOutline" class="spin" slot="start"></ion-icon>
                    <span
                    >{{ $t('OVERVIEW_PAGE.DOWNLOADING') }}
                          <template v-if="libraryStore.epocProgresses[epoc.id]"
                          >({{ libraryStore.epocProgresses[epoc.id] }}%)</template
                          ></span
                    >
                  </ion-button>
                  <ion-button
                      class="expanded"
                      size="large"
                      expand="block"
                      :disabled="true"
                      color="inria-contrast-button"
                      v-if="epoc.unzipping"
                  >
                    <ion-icon :icon="cogOutline" class="spin" slot="start"></ion-icon>
                    <span
                    >{{ $t('OVERVIEW_PAGE.OPENING') }}
                          <template v-if="libraryStore.epocProgresses[epoc.id]"
                          >({{ libraryStore.epocProgresses[epoc.id] }}%)</template
                          ></span
                    >
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
        transition: aspect-ratio 0.5s ease-in-out;
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
