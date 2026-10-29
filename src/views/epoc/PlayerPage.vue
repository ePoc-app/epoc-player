<script setup lang="ts">
import { uid } from '@epoc/epoc-types/src/v1';
import {
    IonContent,
    IonIcon,
    IonPage,
    IonProgressBar,
    IonSpinner,
    onIonViewDidEnter,
    onIonViewWillLeave,
} from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { useEpocStore } from '@/stores/epocStore';
import { useReadingStore } from '@/stores/readingStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMediaPlayerStore } from '@/stores/mediaPlayerStore';
import { useRoute } from 'vue-router';
import { onIonViewWillEnter } from '@ionic/vue';
import { storeToRefs } from 'pinia';
import { Chapter } from '@/types/epoc';
import { Reading, UserAssessment } from '@/types/reading';
import { Content } from '@/types/contents/content';
import { srcConvert } from '@/utils/pipes';
import { menu } from 'ionicons/icons';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Swiper as SwiperObject } from 'swiper/types';
import ChapterInfo from '@/views/epoc/content/ChapterInfo.vue';
import ChapterEnd from './content/ChapterEnd.vue';
import AppDebug from './content/AppDebug.vue';
import CommonContent from './content/CommonContent.vue';
import CertificateModal from '@/components/CertificateModal.vue';
import { appService } from '@/utils/appService';
import HtmlContent from './content/HtmlContent.vue';
import VideoContent from './content/VideoContent.vue';
import AudioContent from '@/views/epoc/content/AudioContent.vue';
import AssessmentContent from './content/AssessmentContent.vue';
import SimpleQuestion from './content/SimpleQuestion.vue';
import { until } from '@vueuse/core';
import { trackEvent, trackPageView } from '@/utils/matomo';
import CourseChoice from '@/views/epoc/content/CourseChoice.vue';
import { CONTENT_TYPE_ICONS } from '@/types/content-icons';
import doubleGauche from '@/assets/icon/double-gauche.svg?url';
import doubleDroite from '@/assets/icon/double-droite.svg?url';
import modulecheck from '@/assets/icon/modulecheck.svg?url';
import { scormReportProgress } from '@/scorm';

const INTERACTIVE_ELEMENTS = ['ion-icon', 'button', 'ion-button', 'ion-checkbox', 'ion-radio', 'span'];

const epocStore = useEpocStore();
const readingStore = useReadingStore();
const settingsStore = useSettingsStore();
const mediaPlayerStore = useMediaPlayerStore();
const route = useRoute();

const { epoc } = storeToRefs(epocStore);
const { settings } = storeToRefs(settingsStore);
const { readings } = storeToRefs(readingStore);

const epocId = computed(() => route.params.epoc_id.toString());
const chapterId = computed(() => route.params.chapter_id?.toString());
const contentId = computed(() => route.params.content_id?.toString());
const shouldNavigateToNext = computed(() => route.params.next?.toString());

const swiperInstance = ref<SwiperObject>();
const reading = ref<Reading>();
const pagesCount = ref(0);
const dataInitialized = ref(false);
const currentPage = ref(0);
const certificateShown = ref(false);
const showControls = ref(true);

const chapterIndex = computed(() => Object.keys(epoc.value?.chapters || []).indexOf(chapterId.value));
const chapter = computed<Chapter | undefined>(() => epoc.value?.chapters[chapterId.value]);

const nextChapterId = computed<uid | undefined>(() => {
    const keys = Object.keys(epoc.value?.chapters || {});
    return keys[chapterIndex.value + 1];
});

const nextChapter = computed(() => {
    if (!nextChapterId.value || !epoc.value?.chapters) return undefined;
    const chapterData = epoc.value.chapters[nextChapterId.value];
    if (!chapterData) return undefined;

    const locked = chapterData.rule
        ? !reading.value || !readingStore.isUnlocked(reading.value, chapterData.rule)
        : false;

    return { ...chapterData, id: nextChapterId.value, locked };
});

const filteredContents = computed<Content[]>(() => {
    if (!reading.value) return [];
    return (
        chapter.value?.initializedContents.filter((content) => {
            if (content.rule) {
              content.locked = !readingStore.isUnlocked(reading.value!, content.rule)
            }
            if (!content.conditional) return true;
            return reading.value?.flags.includes(content.id);
        }) || []
    );
});

const progress = computed(() => (pagesCount.value > 0 ? currentPage.value / pagesCount.value : 0));

const assessments = computed(() => epoc.value?.assessments || []);

const assessmentData = computed(() => {
    if (!epoc.value || !reading.value) {
        return { totalUserScore: 0, totalScore: 0 };
    }

    let totalUserScore = 0;
    let totalScore = 0;

    assessments.value.forEach((assessment) => {
        if (!assessment.questions) return;

        const userAssessment = reading.value?.assessments.find((a: UserAssessment) => assessment.id === a.id);
        const scoreTotal = epocStore.calcScoreTotal(epoc.value!, assessment.questions);

        if (userAssessment && userAssessment.score > 0) {
            totalUserScore += userAssessment.score;
        }
        totalScore += scoreTotal;
    });

    return { totalUserScore, totalScore };
});

const certificateUnlocked = computed(() => {
    if (!epoc.value || !reading.value) return false;

    const meetsScoreRequirements = assessmentData.value.totalUserScore >= epoc.value.certificateScore;
    const meetsBadgeRequirement = (reading.value.badges.length || 0) >= epoc.value.certificateBadgeCount;
    return meetsScoreRequirements && meetsBadgeRequirement;
});

const scorePercent = computed(() => {
    const { totalUserScore, totalScore } = assessmentData.value;
    return totalScore > 0 ? Math.round((totalUserScore / totalScore) * 100) : 0;
});

const readerStyles = computed(() => {
    const defaultStyles = {
        'font-family': 'Inria Sans',
        'font-size': '16px',
        'line-height': 1.4,
    };

    if (!settings.value) return defaultStyles;

    return {
        'font-family': settings.value.font,
        'font-size': `${settings.value.fontSize}px`,
        'line-height': settings.value.lineHeight,
    };
});

const canNavigatePrevious = computed(() => currentPage.value > 0);
const canNavigateNext = computed(() => currentPage.value <= filteredContents.value.length);

watch(
    epoc,
    (newEpoc) => {
        if (newEpoc) initializeData();
    },
    { immediate: true }
);

watch([scorePercent, certificateUnlocked], ([score, unlocked]) => scormReportProgress(score, unlocked));

watch(
    () => mediaPlayerStore.isTimelineDragging,
    (isDragging) => {
        if (isDragging) {
            swiperInstance.value?.disable();
        } else {
            swiperInstance.value?.enable();
        }
    }
);

onIonViewWillEnter(async () => {
    if (contentId.value) {
        await until(dataInitialized).toBeTruthy();
        navigateToContent(contentId.value, 0);
    }
});

onIonViewDidEnter(async () => {
    updateScreenReaderFocus();
});

// Leaving the page (chapter change, TOC, home, ...): a video already in PiP keeps
// playing, anything else gets paused; a playing audio surfaces the mini player.
onIonViewWillLeave(() => {
    mediaPlayerStore.handleMediaOnNavigate();
});

function initializeData() {
    readingStore.saveStatement(epocId.value, 'chapters', chapterId.value, 'started', true);
    trackEvent(epocId.value, `${epocId.value} / Chapter ${chapterId.value} ${chapter.value?.title} started`);

    reading.value = readings.value.find((item) => item.epocId === epocId.value);
    if (!reading.value) {
      reading.value = readingStore.addReading(epocId.value);
    }

    readingStore.saveChapterProgress(epocId.value, chapterId.value);
    checkForCertificate();
    dataInitialized.value = true;
}

function checkForCertificate() {
    if (!epoc.value || !reading.value) return;

    if (certificateUnlocked.value && !reading.value.certificateShown) {
        certificateShown.value = true;
        readingStore.updateCertificateShown(epoc.value.id, true);
        trackEvent(epoc.value.id, `${epoc.value.id} / Certificate unlocked`);
    }
}

function navigatePrevious() {
    if (!canNavigatePrevious.value) return;
    swiperInstance.value?.slidePrev();
}

function navigateNext() {
    if (!canNavigateNext.value) return;
    swiperInstance.value?.slideNext();
}

function navigateToContent(targetContentId: uid, duration?: number) {
    const pageIndex = filteredContents.value.findIndex((content) => content.id === targetContentId);

    if (pageIndex === -1) return;

    // add 1 for the chapter info slide, add 1 more if navigating to next content
    const targetIndex = shouldNavigateToNext.value ? pageIndex + 2 : pageIndex + 1;

    updatePagesCount();
    swiperInstance.value?.slideTo(targetIndex, duration);
    currentPage.value = targetIndex;
}

function handleSlideChange() {
    mediaPlayerStore.handleMediaOnNavigate();

    const newIndex = swiperInstance.value?.activeIndex || 0;
    currentPage.value = newIndex;

    updatePagesCount();
    updateCurrentContent(newIndex);
}

function updateCurrentContent(index: number) {
    const contentIndex = index - 1;
    const content = filteredContents.value[contentIndex];

    if (!content) return;

    // Update url without triggering navigation
    const baseUrl = import.meta.env.BASE_URL;
    const newUrl = `${baseUrl}epoc/play/${epocId.value}/${chapterId.value}/content/${content.id}`;
    window.history.replaceState({}, '', newUrl);
    trackPageView(newUrl, content.title);

    readingStore.saveChapterProgress(epocId.value, chapterId.value, content.id);
    readingStore.saveStatement(epocId.value, 'pages', content.id, 'viewed', true);

    if (content.type === 'html') {
        readingStore.saveStatement(epocId.value, 'contents', content.id, 'read', true);
    }
}

function updatePagesCount() {
    pagesCount.value = filteredContents.value.length + 1;
    swiperInstance.value?.updateSlides();
}

function handleSwiper(swiper: SwiperObject) {
    swiperInstance.value = swiper;
}

function toggleControls(_swiper: SwiperObject, event: Event) {
    const target = event.target as HTMLElement;
    const isInteractiveElement = INTERACTIVE_ELEMENTS.includes(target.tagName.toLowerCase());

    if (isInteractiveElement || appService.screenReaderDetected) return;

    showControls.value = !showControls.value;
}

function hideControls() {
    if (!appService.screenReaderDetected) {
        showControls.value = false;
    }
}

function handleDragEvent(event: DragEvent) {
    if (event === 'dragstart') {
        swiperInstance.value?.disable();
    } else {
        swiperInstance.value?.enable();
    }
}

function displayMenu() {
    epocStore.epocMainMenu(chapterIndex.value, chapter.value);
}

function updateScreenReaderFocus() {
    if (!appService.screenReaderDetected) return;

    const readerElement = document.querySelector(
        'app-epoc-player.ion-page:not(.ion-page-hidden) .reader'
    ) as HTMLElement;

    readerElement?.focus();
}
</script>

<template>
    <ion-page>
        <ion-content>
            <ion-spinner v-if="!dataInitialized || !chapter || !epoc" />

            <template v-else>
                <div class="reader" slot="fixed" :style="readerStyles" tabindex="-1">
                    <swiper
                        class="reader-slider"
                        @swiper="handleSwiper"
                        @tap="toggleControls"
                        @slide-change-transition-end="updateScreenReaderFocus"
                        @slider-move="hideControls"
                        @slide-change-transition-start="handleSlideChange"
                    >
                        <swiper-slide>
                            <app-debug :epocId="epocId" :chapterId="chapterId" contentId="debut" />
                            <chapter-info :chapter="chapter" />
                        </swiper-slide>

                        <swiper-slide
                            v-for="(content, index) in filteredContents"
                            :key="content.id"
                        >
                            <app-debug :epocId="epocId" :chapterId="chapterId" :contentId="content.id" />

                            <template v-if="content.locked">
                              <common-content
                                  :aria-hidden="index + 1 !== currentPage"
                                  :title="$t('PLAYER.LOCKED_CONTENT')"
                                  :subtitle="''"
                                  :icon="CONTENT_TYPE_ICONS['locked']"
                              >
                                <p class="locked-content-message">{{ $t('PLAYER.LOCKED_CONTENT_MESSAGE') }}</p>
                              </common-content>
                            </template>
                            <template v-else>
                              <common-content
                                  v-if="content.type !== 'simple-question'"
                                  :aria-hidden="index + 1 !== currentPage"
                                  :title="content.title"
                                  :subtitle="content.subtitle || ''"
                                  :icon="CONTENT_TYPE_ICONS[content.type]"
                              >
                                  <html-content
                                      v-if="content.type === 'html'"
                                      :html="srcConvert(content.html, epocStore.rootFolder)"
                                      :lazy-iframes="index + 1 !== currentPage"
                                      @go-to="navigateToContent"
                                  />
                                  <video-content v-else-if="content.type === 'video'" :content="content" />
                                  <audio-content v-else-if="content.type === 'audio'" :content="content" />
                                  <course-choice v-else-if="content.type === 'choice'" :epocId="epocId" :content="content" @chosen="navigateNext" />
                                  <assessment-content v-else-if="content.type === 'assessment'" :content="content" />
                              </common-content>

                              <simple-question
                                  v-else
                                  :aria-hidden="index + 1 !== currentPage"
                                  :epocId="epocId"
                                  :content="content"
                                  :question="epoc.questions[content.question]"
                                  @dragging="handleDragEvent"
                              />
                            </template>
                        </swiper-slide>

                        <swiper-slide>
                            <app-debug :epocId="epocId" :chapterId="chapterId" contentId="fin" />
                            <common-content
                                :title="$t('PLAYER.MODULE_END.FINISH')"
                                :subtitle="$t('PLAYER.MODULE_END.CONGRATS')"
                                :icon="modulecheck"
                            >
                                <chapter-end :epoc="epoc" :chapter="chapter" :next-chapter="nextChapter!" />
                            </common-content>
                        </swiper-slide>
                    </swiper>
                </div>

                <div aria-hidden="true" class="reader-progress" slot="fixed">
                    <ion-progress-bar color="inria" :value="progress" />
                </div>

                <CertificateModal slot="fixed" :epocId="epocId" v-model:open="certificateShown" />

                <div class="reader-actions" :class="{ showing: showControls }" slot="fixed">
                    <div
                        :aria-disabled="!canNavigatePrevious"
                        aria-label="Précédent"
                        role="button"
                        class="reader-action"
                        :class="{ disabled: !canNavigatePrevious }"
                        @click="navigatePrevious"
                    >
                        <ion-icon aria-hidden="true" :src="doubleGauche" />
                    </div>

                    <div aria-label="Menu" role="button" class="reader-action small" @click="displayMenu()">
                        <ion-icon aria-hidden="true" :icon="menu" />
                    </div>

                    <div
                        :aria-disabled="!canNavigateNext"
                        aria-label="Suivant"
                        role="button"
                        class="reader-action"
                        :class="{ disabled: !canNavigateNext }"
                        @click="navigateNext"
                    >
                        <ion-icon aria-hidden="true" :src="doubleDroite" />
                    </div>
                </div>
            </template>
        </ion-content>
    </ion-page>
</template>

<style scoped lang="scss">
.reader-progress {
    width: 100%;
    top: var(--ion-safe-area-top);
    z-index: 1;
}

ion-spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

.reader-slider {
    position: absolute;
    height: 100%;
    width: 100%;
    overflow: hidden;
}

.reader {
    position: absolute;
    top: var(--ion-safe-area-top);
    height: calc(100% - var(--ion-safe-area-top));
    width: 100%;
    opacity: 1;
    transition: opacity 0.3s ease;
    background: var(--ion-color-contrast-2);

    swiper-slide {
        flex-direction: column;
        background-color: var(--ion-color-contrast-2);
    }
}

.reader-actions {
    position: absolute;
    bottom: calc(0.25rem + var(--ion-safe-area-bottom));
    left: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    transform: translateY(150px) translateX(-50%);
    transition: transform 0.3s;
    transition-timing-function: cubic-bezier(0.42, 0, 0.58, 1);
    z-index: 50;

    &.showing {
        transform: translateY(0) translateX(-50%);
    }

    .reader-action {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 3.5rem;
        height: 3.5rem;
        margin: 0.2rem;
        background: var(--ion-color-contrast-3);
        box-shadow: -4px -4px 8px 0 var(--ion-color-reader-action-shadow-1),
            4px 4px 8px 0 var(--ion-color-reader-action-shadow-2);
        border-radius: 4rem;
        font-size: 1.5rem;
        color: var(--ion-color-icon-2);
        cursor: pointer;

        &.disabled {
            color: var(--ion-color-reader-action-disabled);
            cursor: default;
        }

        &.small {
            width: 2.5rem;
            height: 2.5rem;
            font-size: 1.25rem;
            color: var(--ion-color-icon);
        }

        &.hidden {
            opacity: 0;
        }
    }
}

.locked-content-message {
  text-align: center;
}

:global(.split-pane-visible .reader-actions) {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    padding: 0 0.5rem;
    transform: translateY(0) !important;
    justify-content: space-between;
    align-items: center;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    pointer-events: none;
}

:global(.split-pane-visible .reader-actions .reader-action) {
    pointer-events: all;
}

:global(.split-pane-visible .reader-action.small) {
    display: none;
}
</style>
