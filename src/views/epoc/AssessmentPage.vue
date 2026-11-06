<script setup lang="ts">
import { Assessment, SimpleQuestion } from '@/types/contents/assessment';
import { useEpocStore } from '@/stores/epocStore';
import { IonIcon, IonButton, IonContent, IonFooter, IonPage } from '@ionic/vue';
import { appService } from '@/utils/appService';
import CertificateModal from '@/components/CertificateModal.vue';
import { useReadingStore } from '@/stores/readingStore';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { alertController, onIonViewDidEnter, onIonViewWillEnter } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { Swiper, SwiperSlide } from 'swiper/vue';
import type { Swiper as SwiperObject } from 'swiper/types';
import { denormalize } from '@/utils/pipes';
import Card from '@/components/Card.vue';
import CommonQuestion from '@/components/questions/CommonQuestion.vue';
import ScoreProgress from '@/components/ScoreProgress.vue';
import { starOutline, arrowForwardOutline } from 'ionicons/icons';
import { trackEvent } from '@/utils/matomo';

const { t } = useI18n();
type CommonQuestionType = InstanceType<typeof CommonQuestion>;

//Store
const epocStore = useEpocStore();
const readingStore = useReadingStore();
const router = useRouter();
const route = useRoute();

const epocId = computed(() => route.params.epoc_id.toString());
const assessmentId = computed(() => route.params.assessment_id?.toString());

const { epoc } = storeToRefs(epocStore);
const { readings } = storeToRefs(readingStore);

const questionsElements = ref<CommonQuestionType[]>([]);

const userResponses = ref<any[]>([]);
const currentQuestionUserResponse = ref<any[]>();
const correctionShown = ref(false);
const currentQuestionIndex = ref(0);
const isEnd = ref(false);
const certificateShown = ref(false);
const questionSlides = ref<SwiperObject>(); //undefined; will be set automatically on mounted by setSwiperRef

// Computed
const reading = computed(() => readings.value.find((question) => question.epocId === epoc.value!.id));
const assessments = computed((): (Assessment | SimpleQuestion)[] => epoc.value!.assessments);
const assessment = computed((): Assessment | SimpleQuestion => epoc.value?.contents[assessmentId.value] as Assessment);

const questions = computed(
    () => assessment.value?.questions?.map((questionId) => epoc.value!.questions[questionId]) || []
);

// Scoring
const userScore = ref(0);
const maxScore = computed(() => epocStore.calcScoreTotal(epoc.value!, assessment.value.questions || []));
const otherAssessmentsUserScore = computed(() => getTotalUserScoreForOtherAssessments(assessments.value));
const allAssessmentsMaxScore = computed(() => getMaxScoreForAllAssessments(assessments.value));

// setup process
if (!reading.value) readingStore.addReading(epocId.value);
readingStore.saveStatement(epocId.value, 'contents', assessmentId.value, 'started', true);

// Lifecycle

onIonViewWillEnter(() => {
    retry();
});

onIonViewDidEnter(() => {
    updateFocus();
    // @ts-expect-error: isPreviewWindow is not defined
    const allowTouch = !!window.isPreviewWindow;
    setTimeout(() => {
        if (questionSlides.value) {
            questionSlides.value.allowTouchMove = allowTouch;
        }
    }, 100);
});

// Methods

// called only once, automatically done by the swiper event
const setSwiperRef = (swiper: SwiperObject) => {
    questionSlides.value = swiper;
};

const retryKey = ref(0);
const retry = async () => {
    userScore.value = 0;
    userResponses.value = [];
    currentQuestionUserResponse.value = undefined;
    correctionShown.value = false;
    currentQuestionIndex.value = 0;
    isEnd.value = false;
    questionSlides.value?.slideTo(0);

    retryKey.value++;
    questionsElements.value = [];
};

const onUserHasResponded = (userResponses: string[]) => {
    currentQuestionUserResponse.value = userResponses;
};

const checkAnswer = () => {
    const question = questions.value ? questions.value[currentQuestionIndex.value] : undefined;
    const response = currentQuestionUserResponse.value;
    if (question && response) {
        const userSucceeded = epocStore.isUserResponsesCorrect(
            question.correctResponse,
            currentQuestionUserResponse.value
        );

        const score = userSucceeded ? +question.score : 0;
        correctionShown.value = true;
        questionsElements.value[currentQuestionIndex.value]?.showCorrection();
        userScore.value += score;
        userResponses.value.push(response);
        trackEvent(
            epocId.value,
            `${epocId.value} / Assessment ${assessmentId.value} ${assessment.value.title} / Question ${currentQuestionIndex.value} attempted`
        );

        if (userSucceeded)
            trackEvent(
                epocId.value,
                `${epocId.value} / Assessment ${assessmentId.value} ${assessment.value.title} / Question ${currentQuestionIndex.value} succeeded`
            );
        else
            trackEvent(
                epocId.value,
                `${epocId.value} / Assessment ${assessmentId.value} ${assessment.value.title} / Question ${currentQuestionIndex.value} failed`
            );

        if (assessment.value && assessment.value.questions) {
            readingStore.saveStatement(
                epocId.value,
                'questions',
                assessment.value.questions[currentQuestionIndex.value],
                'attempted',
                true
            );
            readingStore.saveStatement(
                epocId.value,
                'questions',
                assessment.value.questions[currentQuestionIndex.value],
                'scored',
                score
            );
            readingStore.saveStatement(
                epocId.value,
                'questions',
                assessment.value.questions[currentQuestionIndex.value],
                'passed',
                userSucceeded
            );
        }
    }
};

const nextQuestion = () => {
    currentQuestionUserResponse.value = undefined;
    correctionShown.value = false;
    currentQuestionIndex.value++;
    if (currentQuestionIndex.value >= questions.value.length) {
        isEnd.value = true;
        checkForCertificate();
        readingStore.saveResponses(epocId.value, assessmentId.value, userScore.value, userResponses.value);
        readingStore.saveStatement(epocId.value, 'contents', assessmentId.value, 'completed', true);
        readingStore.saveStatement(epocId.value, 'contents', assessmentId.value, 'scored', userScore.value);
    }
    questionSlides.value?.slideNext();
    setTimeout(() => {
        updateFocus();
    }, 1000);
};

function checkForCertificate() {
    if (!epoc.value || !reading.value) return;

    const meetsScoreRequirements = otherAssessmentsUserScore.value + userScore.value >= epoc.value.certificateScore;
    const meetsBadgeRequirement = (reading.value.badges.length || 0) >= epoc.value.certificateBadgeCount;

    if (meetsScoreRequirements && meetsBadgeRequirement && !reading.value.certificateShown) {
        certificateShown.value = true;
        readingStore.updateCertificateShown(epoc.value.id, true);
        trackEvent(epoc.value.id, `${epoc.value.id} / Certificate unlocked`);
    }
}

const back = () => {
    presentAlertConfirm();
};

const presentAlertConfirm = async () => {
    const alert = await alertController.create({
        header: t('QUESTION.QUIT_MODAL.HEADER'),
        message: t('QUESTION.QUIT_MODAL.MSG'),
        buttons: [
            {
                text: t('QUESTION.QUIT_MODAL.STAY'),
                role: 'cancel',
            },
            {
                text: t('QUESTION.QUIT_MODAL.QUIT'),
                handler: () => {
                    router.push(
                        `/epoc/play/${epocId.value}/${assessment.value.chapterId}/content/${assessmentId.value}`
                    );
                },
            },
        ],
    });

    await alert.present();
};

const resume = () => {
    router.push(`/epoc/play/${epocId.value}/${assessment.value.chapterId}/content/${assessmentId.value}/next`);
};

const updateFocus = () => {
    if (appService.screenReaderDetected) {
        (document.querySelector('app-epoc-assessment .assessment-reader') as HTMLElement).focus();
    }
};

const getTotalUserScoreForOtherAssessments = (assessments: (Assessment | SimpleQuestion)[]): number => {
    let userScore = 0;
    assessments.forEach((assessment: Assessment | SimpleQuestion) => {
        if (assessment.id !== assessmentId.value) {
            const userAssessment = reading.value?.assessments.find((a) => assessment.id === a.id);
            if (userAssessment && userAssessment.score > 0) {
                userScore += userAssessment.score;
            }
        }
    });
    return userScore;
};

const getMaxScoreForAllAssessments = (assessments: (Assessment | SimpleQuestion)[]): number => {
    let maxScore = 0;
    assessments.forEach((assessment: Assessment | SimpleQuestion) => {
        maxScore += assessment.scoreTotal || 0;
    });
    return maxScore;
};
</script>

<template>
    <ion-page>
        <ion-content v-if="assessment" :scrollY="false">
            <div class="slider-wrapper assessment-reader" slot="fixed" tabindex="1">
                <swiper :allow-touch-move="false" class="slider assessment-swiper" @swiper="setSwiperRef">
                    <swiper-slide
                        v-for="(question, questionIndex) in denormalize(assessment.questions, epoc?.questions)"
                        :key="`${questionIndex}-${retryKey}`"
                    >
                        <common-question
                            :ref="
                                (el) => {
                                    if (el) questionsElements[questionIndex] = el as CommonQuestionType;
                                }
                            "
                            :question="question"
                            :closable="true"
                            :contentId="assessment.id"
                            :epocId="epocId"
                            :aria-hidden="questionIndex !== currentQuestionIndex"
                            :subtitle="'Question ' + (questionIndex + 1) + '/' + assessment.questions?.length"
                            @close="back"
                            @userHasResponded="onUserHasResponded"
                        />
                    </swiper-slide>

                    <swiper-slide class="assessment-end">
                        <card v-if="isEnd">
                            <div class="title-container">
                                <div class="title-icon">
                                    <ion-icon aria-hidden="true" :icon="starOutline" />
                                </div>
                                <h5 class="title" v-if="maxScore > 0">{{ $t('QUESTION.ASSESSMENT_PAGE.SCORE') }}</h5>
                                <h5 class="title" v-if="maxScore <= 0">
                                    {{ $t('QUESTION.ASSESSMENT_PAGE.NOT_GRADED') }}
                                </h5>
                            </div>

                            <div v-if="maxScore > 0" class="score">
                                <div class="score-points">
                                    <div class="score-points-assessment">{{ userScore }} pts</div>
                                    <div class="score-points-total">
                                        <b>{{ $t('QUESTION.ASSESSMENT_PAGE.TOTAL_SCORE') }}</b>
                                        {{ otherAssessmentsUserScore + userScore }} / {{ allAssessmentsMaxScore }}
                                    </div>
                                </div>

                                <div aria-hidden="true" class="score-chart">
                                    <score-progress
                                        :progress="(otherAssessmentsUserScore / allAssessmentsMaxScore) * 100"
                                        :delta="(userScore / allAssessmentsMaxScore) * 100"
                                        :threshold="
                                            epoc?.certificateBadgeCount
                                                ? undefined
                                                : (epoc!.certificateScore / allAssessmentsMaxScore) * 100
                                        "
                                        :minLabel="0"
                                        :maxLabel="allAssessmentsMaxScore"
                                    />
                                </div>
                            </div>

                            <ion-button
                                size="large"
                                expand="block"
                                color="outline-button"
                                fill="outline"
                                @click="retry"
                            >
                                <span>{{ $t('QUESTION.ASSESSMENT_PAGE.RESTART_ACTIVITY') }}</span>
                            </ion-button>
                        </card>
                    </swiper-slide>
                </swiper>
            </div>

            <CertificateModal :epocId="epocId" v-model:open="certificateShown" />
        </ion-content>

        <ion-footer v-if="!isEnd">
            <ion-button
                v-if="!correctionShown"
                size="large"
                expand="block"
                color="inria"
                :disabled="!currentQuestionUserResponse"
                @click="checkAnswer()"
            >
                <span>{{ $t('QUESTION.VALIDATE') }}</span>
            </ion-button>

            <div class="next-buttons">
                <ion-button
                    v-if="correctionShown"
                    role="button"
                    color="inria-grey"
                    size="large"
                    expand="block"
                    @click="nextQuestion()"
                >
                    <span>{{ $t('QUESTION.NEXT') }}</span>
                    <ion-icon aria-hidden="true" :icon="arrowForwardOutline" slot="end" />
                </ion-button>
            </div>
        </ion-footer>

        <ion-footer v-else>
            <ion-button role="button" size="large" expand="block" color="inria" @click="resume">
                <span>{{ $t('QUESTION.ASSESSMENT_PAGE.CONTINUE_COURSE') }}</span>
            </ion-button>
        </ion-footer>
    </ion-page>
</template>

<style scoped lang="scss">
.slider-wrapper {
    position: absolute;
    top: var(--ion-safe-area-top);
    height: calc(100% - var(--ion-safe-area-top));
    width: 100%;
    opacity: 1;
    transition: opacity 0.3s ease;
    background: var(--ion-color-contrast-2);

    &.loading {
        opacity: 0;
    }
    .slider {
        position: absolute;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    swiper-slide {
        flex-direction: column;
    }
}

ion-footer {
    padding: 1rem 1rem calc(1rem + var(--ion-safe-area-bottom)) 1rem;
}

.next-buttons {
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
        margin: auto;
        font-size: 1.5rem;
        border-radius: 1rem;
    }

    .subtitle {
        font-size: 0.8rem;
        font-weight: bold;
        color: var(--ion-color-inria);
        text-transform: uppercase;
    }

    .title {
        font-size: 1.3rem;
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

    &-points-assessment {
        font-size: 2rem;
        font-weight: bold;
    }

    &-points-total {
        font-size: 0.8rem;
        font-weight: bold;
        text-transform: uppercase;
        b {
            color: var(--ion-color-inria-grey);
        }
    }
}
</style>
