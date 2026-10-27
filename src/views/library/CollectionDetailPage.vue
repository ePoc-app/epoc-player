<script setup lang="ts">
import {
  IonContent,
  IonButton,
  IonHeader,
  IonPage,
  IonBackButton,
  IonTitle,
  IonToolbar,
  IonIcon,
  IonButtons
} from '@ionic/vue';
import {
  cloudDownloadOutline,
  arrowForwardOutline,
  cogOutline,
  syncOutline,
  mailOutline,
  linkOutline,
} from 'ionicons/icons';
import { useLibraryStore } from '@/stores/libraryStore';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { computed, onUnmounted, ref, watch } from 'vue';

const libraryStore = useLibraryStore();
const route = useRoute();
const router = useRouter();
const collection = computed(() => {
    const collectionId = route.params.collection_id?.toString();

    return collectionId ? libraryStore.collections[collectionId] : undefined;
});

// Clamp the mobile description to 3 lines, with a toggle when it overflows
const descriptionEl = ref<HTMLElement>();
const descriptionExpanded = ref(false);
const descriptionOverflows = ref(false);
const descriptionObserver = new ResizeObserver(() => {
    const el = descriptionEl.value;
    if (!el || descriptionExpanded.value) return;
    descriptionOverflows.value = el.scrollHeight > el.clientHeight + 1;
});

watch(descriptionEl, (el, oldEl) => {
    if (oldEl) descriptionObserver.unobserve(oldEl);
    if (el) descriptionObserver.observe(el);
});
watch(() => collection.value?.id, () => {
    descriptionExpanded.value = false;
});
onUnmounted(() => descriptionObserver.disconnect());
</script>

<template>
    <ion-page v-if="collection">
        <ion-header class="mobile-only" :translucent="true">
            <ion-toolbar>
              <ion-buttons slot="start">
                <ion-back-button text="" defaultHref="/library" color="inria-icon"></ion-back-button>
              </ion-buttons>
                <ion-title>{{ collection.title }}</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content :fullscreen="true">
            <div class="mobile-only publisher-logo">
                <div
                    class="logo"
                    v-if="collection.publisher.logo"
                    :style="'background-image:url(' + collection.publisher.logo + ')'"
                />
                <div class="publisher-name" v-else>{{ collection.publisher.name }}</div>
            </div>
            <div class="mobile-only publisher-info">
                <template v-if="collection.publisher.description">
                    <p ref="descriptionEl" class="publisher-description" :class="{ expanded: descriptionExpanded }">
                        {{ collection.publisher.description }}
                    </p>
                    <button
                        v-if="descriptionOverflows"
                        class="publisher-description-toggle"
                        :aria-expanded="descriptionExpanded"
                        @click="descriptionExpanded = !descriptionExpanded"
                    >
                        {{ descriptionExpanded ? $t('LIBRARY_PAGE.VIEW_LESS') : $t('LIBRARY_PAGE.VIEW_MORE') }}
                    </button>
                </template>
                <div class="publisher-links">
                    <a v-if="collection.publisher.email" :href="`mailto:${collection.publisher.email}`" :title="collection.publisher.email"><ion-icon :icon="mailOutline" aria-hidden="true"></ion-icon>{{ $t('LIBRARY_PAGE.EMAIL') }}</a>
                    <a v-if="collection.publisher.website" :href="collection.publisher.website" target="_blank" rel="noopener" :title="collection.publisher.website"><ion-icon :icon="linkOutline" aria-hidden="true"></ion-icon>{{ $t('LIBRARY_PAGE.WEBSITE') }}</a>
                </div>
            </div>

            <div class="web-only">
              <div class="web-page-header">
                <div class="web-page-header-logo" v-if="collection.publisher.logo">
                  <div
                      class="logo"
                      :style="'background-image:url(' + collection.publisher.logo + ')'"
                  />
                </div>
                <div class="web-page-header-info">
                  <h1>{{ collection.title }}</h1>
                  <p v-if="collection.publisher.description">{{ collection.publisher.description }}</p>
                  <div class="publisher-links">
                    <a v-if="collection.publisher.email" :href="`mailto:${collection.publisher.email}`" :title="collection.publisher.email"><ion-icon :icon="mailOutline" aria-hidden="true"></ion-icon>{{ $t('LIBRARY_PAGE.EMAIL') }}</a>
                    <a v-if="collection.publisher.website" :href="collection.publisher.website" target="_blank" rel="noopener" :title="collection.publisher.website"><ion-icon :icon="linkOutline" aria-hidden="true"></ion-icon>{{ $t('LIBRARY_PAGE.WEBSITE') }}</a>
                  </div>
                </div>
              </div>
            </div>

            <div id="container">
                <div class="library-line-separator" />
                <div class="library-items" tabindex="-1">
                    <div class="library-item" v-for="epoc in Object.values(collection.ePocs)" :key="epoc.id">
                        <RouterLink
                            :to="{ name: 'EpocOverviewPage', params: { libraryId: collection.id, id: epoc.id } }"
                        >
                            <div
                                :aria-label="epoc.title"
                                class="library-item-image"
                                :style="'background-image:url(' + epoc.image + ')'"
                            />
                        </RouterLink>

                        <h3 aria-hidden="true" class="library-item-title">{{ epoc.title }}</h3>

                        <div class="library-item-toolbar" v-if="epoc.downloaded">
                            <ion-button
                                class="expanded"
                                color="inria"
                                @click="router.push({ name: 'TocPage', params: { epoc_id: epoc.id } })"
                            >
                                <span v-if="epoc.opened">{{ $t('LIBRARY_PAGE.CONTINUE') }}</span>
                                <ion-icon
                                    aria-hidden="true"
                                    v-if="epoc.opened"
                                    :icon="arrowForwardOutline"
                                    slot="end"
                                />
                                <span v-if="!epoc.opened">{{ $t('LIBRARY_PAGE.DISCOVER') }}</span>
                            </ion-button>

                            <ion-button
                                class="round"
                                :class="{ 'update-available': epoc.updateAvailable }"
                                color="inria-base-button"
                                @click="libraryStore.epocLibraryMenu(epoc, collection.id)"
                            >
                                <span aria-label="Option du chapitre" class="ellipsis base-btn">...</span>
                            </ion-button>
                        </div>

                        <div
                            class="library-item-toolbar"
                            v-if="!epoc.downloading && !epoc.downloaded && !epoc.unzipping"
                        >
                            <ion-button
                                class="expanded"
                                color="inria-base-button"
                                @click="libraryStore.downloadEpoc(epoc, collection.id)"
                            >
                                <ion-icon aria-hidden="true" :icon="cloudDownloadOutline" slot="start" />
                                <span class="base-btn">{{ $t('LIBRARY_PAGE.DOWNLOAD') }}</span>
                            </ion-button>
                        </div>

                        <div class="library-item-toolbar" v-if="epoc.downloading">
                            <ion-button class="expanded" :disabled="true" color="inria-base-button">
                                <ion-icon aria-hidden="true" :icon="syncOutline" class="spin" slot="start" />
                                <span class="base-btn">
                                    {{ $t('LIBRARY_PAGE.DOWNLOADING') }}
                                    <!--<template v-if="epocProgresses[epoc.id]">({{epocProgresses[epoc.id]}}%)</template>-->
                                </span>
                            </ion-button>
                        </div>

                        <div class="library-item-toolbar" v-if="epoc.unzipping">
                            <ion-button class="expanded" :disabled="true" color="inria-base-button">
                                <ion-icon aria-hidden="true" :icon="cogOutline" class="spin" slot="start" />
                                <span class="base-btn">
                                    {{ $t('LIBRARY_PAGE.OPEN_ZIP') }}
                                    <!--<template v-if="epocProgresses[epoc.id]">({{epocProgresses[epoc.id]}}%)</template>-->
                                </span>
                            </ion-button>
                        </div>
                    </div>
                </div>
            </div>
        </ion-content>
    </ion-page>
</template>

<style scoped lang="scss">
@use '@/theme/library.scss';

ion-toolbar {
    .title-default {
        text-transform: none;
        text-align: center;
    }
}

.publisher-logo {
    position: relative;
    width: 100%;
    height: 180px;

    .logo {
        position: absolute;
        top: 1rem;
        left: 1rem;
        width: calc(100% - 2rem);
        height: calc(100% - 2rem);
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
    }
}

.web-page-header {
    display: flex;
    align-items: flex-start;
    gap: 1.5rem;
    padding: 2rem 1.5rem 1rem;
    border-bottom: 1px solid var(--ion-color-item);

    &-logo {
        flex-shrink: 0;
        width: 120px;
        height: 80px;

        .logo {
            width: 100%;
            height: 100%;
            background-size: contain;
            background-position: center left;
            background-repeat: no-repeat;
        }
    }

    &-info {
        flex: 1;
        min-width: 0;

        h1 {
            margin: 0 0 0.5rem;
            font-size: 1.5rem;
            font-weight: 900;
            color: var(--ion-color-inria-blue);
            line-height: 1.2;
        }

        p {
            margin: 0 0 0.5rem;
            font-size: 0.9rem;
            color: var(--ion-color-text-2);
        }
    }
}

.publisher-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin-top: 0.5rem;

    a {
        font-size: 0.875rem;
        color: var(--ion-color-inria);
        text-decoration: none;
        white-space: nowrap;

        &:hover {
            text-decoration: underline;
        }

        ion-icon {
          display: inline-block;
          vertical-align: middle;
          font-size: 1rem;
          margin-right: 5px;
        }
    }
}

.publisher-info {
    padding: 0 1rem 1rem;
}

.publisher-description {
    margin: 0 0 0.25rem;
    font-size: 0.9rem;
    color: var(--ion-color-text-2);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;

    &.expanded {
        display: block;
        -webkit-line-clamp: unset;
        line-clamp: unset;
    }
}

.publisher-description-toggle {
    padding: 0;
    margin-bottom: 0.5rem;
    background: none;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ion-color-inria);
    cursor: pointer;
}
</style>
