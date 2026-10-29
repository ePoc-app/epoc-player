<script setup lang="ts">
import {
    IonContent,
    IonHeader,
    IonPage,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonIcon,
    IonBackButton,
    IonButton,
    alertController,
    loadingController,
} from '@ionic/vue';
import { ref, reactive, computed, Ref, watch } from 'vue';
import { useEpocStore } from '@/stores/epocStore';
import ScoreProgress from '@/components/ScoreProgress.vue';
import { useRoute } from 'vue-router';
import { chevronForwardOutline, downloadOutline, starOutline } from 'ionicons/icons';
import BadgeComponent from '@/components/Badge.vue';
import BadgeModal from '@/components/BadgeModal.vue';
import type { Badge } from '@/types/epoc';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUser } from '@/composables';
import { handleSetUser } from '@/utils/user';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import jsPDF from 'jspdf';
import { generatePdf } from '@/utils/pdf';
import { useReadingStore } from '@/stores/readingStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { storeToRefs } from 'pinia';
import type { Reading } from '@/types/reading';
import type { uid } from '@epoc/epoc-types/dist/v1';
import { denormalize } from '@/utils/pipes';
import { FileViewer } from '@capacitor/file-viewer';
import badgeSvg from '@/assets/icon/badge.svg?url';

const { t } = useI18n();

const epocStore = useEpocStore();
const settingsStore = useSettingsStore();
const readingStore = useReadingStore();
const libraryStore = useLibraryStore();

const { epoc } = storeToRefs(epocStore);
const { readings } = storeToRefs(readingStore);

const route = useRoute();

const { user } = useUser();

const reading: Ref<Reading | undefined> = ref();
const badgeMode = computed(() => (epoc.value?.badges ? Object.keys(epoc.value.badges).length > 0 : false));

const certificateUnlocked = computed(() => {
    if (!epoc.value) return false;

    return badgeMode.value
        ? reading.value?.badges
            ? reading.value.badges.length >= epoc.value.certificateBadgeCount
            : false
        : assessmentData.totalUserScore >= epoc.value.certificateScore;
});

const assessmentData = reactive({
    successStore: 0,
    attemptedScore: 0,
    todoScore: 0,
    totalUserScore: 0,
    totalScore: 0,
});

const badgeModal: Ref<Badge | undefined> = ref();
const showBadgeModal = ref(false);
function showBadgeDetail(badge: Badge) {
    badgeModal.value = badge;
    showBadgeModal.value = true;
}

const loading = ref(false);
async function getCertificate() {
    if (!epoc.value) return;

    if (loading.value) {
        presentFail(
            t('PLAYER.SCORE.FAIL_MODAL.HEADER'),
            t('PLAYER.SCORE.FAIL_MODAL.MSG', { score: epoc.value.certificateScore })
        );

        return;
    }

    if (settingsStore.settings.devMode || certificateUnlocked.value) {
        if (!user.value) {
            const userData = await handleSetUser();
            if (!userData) return;
        }

        await presentLoading();
        const isInriaEpoc = libraryStore.isInriaEpoc(epoc.value);
        downloadPdf(await generatePdf(epoc.value, epocStore.rootFolder, unlockedBadges.value, isInriaEpoc));
    }
}

function downloadPdf(doc: jsPDF) {
    if (!epoc.value) return;

    const fileName = `attestation-${epoc.value.id}.pdf`;

    if (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android') {
        // Save the PDF to the device
        const output = doc.output('datauristring');
        Filesystem.writeFile({
            path: fileName,
            data: output,
            directory: Directory.Data,
        })
            .then(() => {
                Filesystem.getUri({
                    directory: Directory.Data,
                    path: fileName,
                })
                    .then((getUriResult) => {
                        try {
                            FileViewer.openDocumentFromLocalPath({
                                path: getUriResult.uri,
                            })
                                .then(() => {
                                    dismissLoading();
                                })
                                .catch(() => {
                                    dismissLoading().then(() => {
                                        t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR'),
                                            t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_PROMPT', {
                                                type: t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_TYPE.OPEN'),
                                            });
                                    });
                                });
                        } catch (e) {
                            dismissLoading().then(() => {
                                presentFail(
                                    t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR'),
                                    t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_PROMPT', {
                                        type: t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_TYPE.OPEN'),
                                    })
                                );
                            });
                        }
                    })
                    .catch(() => {
                        dismissLoading().then(() => {
                            presentFail(
                                t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR'),
                                t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_PROMPT', {
                                    type: t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_TYPE.RECUP'),
                                })
                            );
                        });
                    });
            })
            .catch(() => {
                dismissLoading().then(() => {
                    presentFail(
                        t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR'),
                        t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_PROMPT', {
                            type: t('PLAYER.SCORE.CERTIFICATE_PDF.ERROR_TYPE.SAVE'),
                        })
                    );
                });
            });
    } else {
        doc.output('dataurlnewwindow');
        dismissLoading();
    }
}

async function presentFail(header: string, message: string) {
    const alert = await alertController.create({
        header,
        message,
        buttons: [t('OK')],
    });

    await alert.present();
}
async function presentLoading() {
    loading.value = true;
    const loadingAlert = await loadingController.create({
        message: t('PLAYER.SCORE.CERTIFICATE_PDF.WAITING'),
    });

    await loadingAlert.present();
}

async function dismissLoading() {
    loading.value = false;
    await loadingController.dismiss();
}

function setAssessmentsData() {
    if (!epoc.value) return;

    assessmentData.successStore = 0;
    assessmentData.attemptedScore = 0;
    assessmentData.todoScore = 0;
    assessmentData.totalUserScore = 0;
    assessmentData.totalScore = 0;

    epoc.value.assessments.forEach((assessment) => {
        if (!assessment.questions) {
            return;
        }

        console.log('readnig', reading.value);
        const userAssessment = reading.value?.assessments.find((a) => assessment.id === a.id);

        const scoreTotal = epocStore.calcScoreTotal(epoc.value!, assessment.questions);

        assessment.score = getScore(assessment) ?? 0;
        assessment.scoreTotal = getScoreTotal(assessment);

        if (userAssessment && userAssessment.score > 0) {
            assessmentData.totalUserScore += userAssessment.score;
            assessmentData.successStore += userAssessment.score;

            if (userAssessment.score < scoreTotal) {
                assessmentData.attemptedScore += scoreTotal - userAssessment.score;
            }
        } else {
            assessmentData.todoScore += scoreTotal;
        }

        assessmentData.totalScore += scoreTotal;
    });
}

function getScore(content: any) {
    return reading.value?.assessments?.find((assessment) => assessment.id === content.id)?.score ?? null;
}

function getScoreTotal(content: any) {
    return epocStore.calcScoreTotal(epoc.value!, content.questions);
}

const unlockedBadges: Ref<uid[]> = ref([]);

watch(
    [epoc, readings],
    ([epocValue, readingsValue]) => {
        if (!epocValue) return;

        if (epocValue && readingsValue) {
            reading.value = readingsValue.find((item) => item.epocId === route.params.epoc_id);
        }

        if (!reading.value) {
            readingStore.addReading(epocValue.id);
        }

        if (badgeMode.value) {
            unlockedBadges.value = reading.value ? reading.value.badges : [];
        }

        setAssessmentsData();
    },
    { immediate: true }
);

const denormalizedBadges = computed(() => denormalize(epoc.value!.badges));
</script>

<template>
    <ion-page>
        <ion-header class="mobile-only" translucent>
            <ion-toolbar>
                <ion-buttons slot="start">
                    <ion-back-button text="" defaultHref="/library" color="inria-icon" />
                </ion-buttons>
                <ion-title>{{ $t('PLAYER.SCORE.HEADER') }}</ion-title>
            </ion-toolbar>
        </ion-header>

        <ion-content>
            <div class="wrapper" v-if="epoc && assessmentData">
                <div class="title-container">
                    <div class="title-icon">
                        <ion-icon :icon="starOutline" />
                    </div>
                    <h5 class="title">{{ $t('PLAYER.SCORE.TOTAL_SCORE') }}</h5>
                </div>

                <div class="score">
                    <div class="score-points">{{ assessmentData.totalUserScore }} {{ $t('PLAYER.SCORE.PTS') }}</div>
                    <div class="score-chart">
                        <ScoreProgress
                            :progress="(assessmentData.totalUserScore / assessmentData.totalScore) * 100"
                            :threshold="badgeMode ? undefined : (epoc.certificateScore / assessmentData.totalScore) * 100"
                            :min-label="0"
                            :max-label="assessmentData.totalScore"
                        />
                    </div>
                </div>

                <template v-if="!epoc.certificateDisabled">
                    <template v-if="!badgeMode">
                        <div v-if="!certificateUnlocked" class="certificate">
                            <h5>{{ $t('PLAYER.SCORE.CONTINUE') }}</h5>
                            <p>
                                {{
                                    $t('PLAYER.SCORE.REMAINING', {
                                        remaining: epoc.certificateScore - assessmentData.totalUserScore,
                                    })
                                }}
                            </p>
                            <ion-button
                                size="default"
                                expand="block"
                                color="medium"
                                fill="outline"
                                @click="getCertificate"
                            >
                                <ion-icon :icon="downloadOutline" slot="start" />
                                <span>{{ $t('PLAYER.SCORE.GET_CERTIFICATE') }}</span>
                            </ion-button>
                        </div>

                        <div v-else class="certificate success">
                            <ion-icon class="badge" :src="badgeSvg" />
                            <h5>{{ $t('PLAYER.SCORE.CONGRATS') }}</h5>
                            <p>{{ $t('PLAYER.SCORE.CERTIFICATE_WIN') }}</p>
                            <ion-button expand="block" @click="getCertificate">
                                <ion-icon :icon="downloadOutline" slot="start" />
                                <span>{{ $t('PLAYER.SCORE.GET_CERTIFICATE') }}</span>
                            </ion-button>
                        </div>
                    </template>

                    <template v-else>
                        <div v-if="!certificateUnlocked" class="certificate flex">
                            <div class="certificate-text">
                                <h6>{{ $t('PLAYER.SCORE.CONTINUE') }}</h6>
                                <p>
                                    {{
                                        $t('PLAYER.SCORE.BADGE_REMAINING', {
                                            remaining: epoc.certificateBadgeCount - unlockedBadges.length,
                                        })
                                    }}
                                </p>
                            </div>
                            <div class="certificate-badge">
                                <BadgeComponent icon="cert-grey" grey nobg />
                            </div>
                        </div>

                        <div v-else class="certificate flex success">
                            <div class="certificate-text">
                                <h6>{{ $t('PLAYER.SCORE.CONGRATS') }}</h6>
                                <p>{{ $t('PLAYER.SCORE.CERTIFICATE_WIN') }}</p>
                            </div>
                            <div class="certificate-badge">
                                <BadgeComponent icon="cert" nobg />
                            </div>
                            <ion-button expand="block" @click="getCertificate">
                                <ion-icon :icon="downloadOutline" slot="start" />
                                <span>{{ $t('PLAYER.SCORE.GET_CERTIFICATE') }}</span>
                            </ion-button>
                        </div>
                    </template>
                </template>

                <div v-if="badgeMode" class="badge-list">
                    <div
                        v-for="(badge, index) of denormalizedBadges"
                        :key="index"
                        class="badge-item"
                        :class="{ unlocked: unlockedBadges.includes(badge.id!) }"
                        @click="showBadgeDetail(badge)"
                    >
                        <BadgeComponent
                            :title="badge.title"
                            :icon="badge.icon"
                            :locked="!unlockedBadges.includes(badge.id!)"
                        />
                    </div>
                </div>

                <div class="short-access">
                    <h4 class="short-access-label">{{ $t('PLAYER.SCORE.PTS_RECAP') }}</h4>
                    <RouterLink
                        v-for="(assessment, index) of epoc.assessments"
                        :key="index"
                        :to="`/epoc/play/${epoc.id}/${assessment.chapterId}/content/${assessment.id}`"
                        class="short-access-item"
                    >
                        <ion-label>
                            {{ assessment.title }}
                            <span>{{ epoc.chapters[assessment.chapterId!].title }}</span>
                        </ion-label>
                        <ion-note
                            :color="
                                assessment?.score !== null && assessment?.score !== undefined
                                    ? (assessment.score ?? 0) < (assessment?.scoreTotal ?? 0)
                                        ? 'inria-certificate'
                                        : 'inria-correct'
                                    : 'inria-icon'
                            "
                            v-if="assessment?.scoreTotal && assessment.scoreTotal > 0"
                        >
                            {{ assessment.score ? assessment.score : 0 }}/{{ assessment.scoreTotal }}
                        </ion-note>
                        <ion-icon :icon="chevronForwardOutline" />
                    </RouterLink>
                </div>
            </div>
        </ion-content>
        <BadgeModal
            v-if="badgeModal && epoc && reading"
            v-model:open="showBadgeModal"
            :badge="badgeModal"
            :epoc="epoc"
            :reading="reading"
        />
    </ion-page>
</template>

<style scoped lang="scss">
.wrapper {
    max-width: 600px;
    margin: auto;
    padding: 1rem;
}

.title-container {
    margin-bottom: 1rem;
    text-align: center;

    .title-icon {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 3rem;
        height: 3rem;
        margin: 0 auto 1rem auto;
        font-size: 1.5rem;
        border-radius: 1rem;
    }

    .title {
        font-size: 1.5rem;
        font-weight: bold;
    }

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

.score {
    text-align: center;

    &-points {
        font-size: 2rem;
        font-weight: bold;
    }
}

.certificate {
    position: relative;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--ion-color-contrast);
    border-radius: 0.5rem;

    &.flex {
        display: flex;
        flex-wrap: wrap;
    }

    &-text {
        width: calc(100% - 1rem - 75px);
        margin-right: 1rem;
    }

    &-badge {
        width: 75px;
        flex-shrink: 0;
    }

    ion-button {
        margin-top: 1rem;
    }

    &.success {
        color: white;
        background: var(--ion-color-inria-certificate);

        ion-button {
            width: 100%;
            flex-shrink: 0;
            --background: white;
            --background-activated: var(--ion-color-light);
            --background-focused: var(--ion-color-light);
            ion-icon,
            span {
                color: var(--ion-color-inria-certificate);
            }
        }
    }

    .badge {
        position: absolute;
        top: 1rem;
        right: 0.5rem;
        font-size: 4rem;
    }

    h5 {
        font-size: 2rem;
        font-weight: bold;
    }

    h6 {
        font-size: 1.4rem;
        font-weight: bold;
        margin: 0 0 5px 0;
    }

    p {
        margin: 0;
    }
}

.badge-list {
    display: flex;
    flex-wrap: wrap;
    margin: 0 -5px;
}

.badge-item {
    width: calc(33.333% - 10px);
    margin: 0 5px 20px 5px;
}

.short-access {
    &-label {
        margin-top: 0;
        padding: 0.5em 0 0.25em 0;
        font-size: 1rem;
        font-weight: bold;
        text-transform: uppercase;
        color: var(--ion-color-inria);
        border-bottom: 1px solid var(--ion-color-item);
    }

    &-item {
        display: flex;
        align-items: center;
        padding: 1rem;
        margin-bottom: 0.5rem;
        border-radius: 0.5rem;
        font-weight: bold;
        background: var(--ion-color-item);
        text-decoration: none;
        color: inherit;

        span {
            display: block;
            max-width: 100%;
            font-weight: normal;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        &:last-child {
            margin-bottom: 0;
        }

        ion-label {
            padding-top: 0.3rem;
            flex-grow: 1;
            max-width: calc(100% - 2.5rem);
        }

        ion-note {
            padding-top: 0.3rem;
            margin: 0 0.5rem;
        }
    }
}
</style>
