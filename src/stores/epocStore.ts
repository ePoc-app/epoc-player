import { defineStore } from 'pinia';
import { ref } from 'vue';
import { actionSheetController } from '@ionic/vue';
import { uid } from '@epoc/epoc-types/dist/v1';
import {
    homeOutline,
    listCircleOutline,
    starOutline,
    receiptOutline,
    settingsOutline,
    cubeOutline,
    informationCircleOutline
} from 'ionicons/icons';
import { readEpocContent } from '@/utils/epocService';
import { Epoc, Chapter } from '@/types/epoc';
import { displayLicence } from '@/utils/app';
import { usePlugin } from '@/composables';
import { Content } from '@/types/contents/content';
import { Capacitor } from '@capacitor/core';
import { i18n } from '@/i18n';
import router from '@/router';
import { useLibraryStore } from '@/stores/libraryStore';
import { useAppMode } from '@/composables/useAppMode';
import { trackSessionStart } from '@/utils/matomo';
import { isScormAvailable } from '@/scorm';

export const useEpocStore = defineStore('epoc', () => {
    // --- State ---
    const pluginService = usePlugin();
    const libraryStore = useLibraryStore();
    const initialized = ref(false);
    const _epoc = ref<Epoc | null>(null);
    const _rootFolder = ref<string>('');
    const { isPreview, isStandalone } = useAppMode();

    const trackingPlatform = () => isStandalone.value ? (isScormAvailable() ? 'SCORM' : 'HTML') : Capacitor.getPlatform();

    // --- Actions ---

    async function getEpocById(id: string): Promise<Epoc | null> {
        if (_epoc.value && _epoc.value.id === id) return _epoc.value;

        initialized.value = false;

        try {
            const epocDir = isPreview.value ? 'epoc-editor' : id.startsWith('local-') ? 'local-epocs' : 'epocs';
            const epoc = await readEpocContent(epocDir, id);

            if (!epoc) {
                return null;
            }

            _rootFolder.value = Capacitor.convertFileSrc(`${epoc.dir}/`);

            _epoc.value = initCourseContent(epoc);

            initialized.value = true;

            trackSessionStart(id, trackingPlatform());

            return _epoc.value;
        } catch (error) {
            console.log('Error reading ePoc content:', error);
            return null;
        }
    }

    /**
     * Initialize ePoc runtime properties
     */
    function initCourseContent(epoc: Epoc): Epoc {
        epoc.assessments = [];
        // backward compatibility before epoc parameters existed
        epoc.parameters = epoc.parameters ? epoc.parameters : {};
        for (const [chapterId, chapter] of Object.entries(epoc.chapters)) {
            chapter.type = 'chapter';
            chapter.resumeLink = `/epoc/play/${epoc.id}/${chapterId}`;
            chapter.time = 0;
            chapter.mediaCount = 0;
            chapter.assessments = [];
            chapter.initializedContents = chapter.contents.map((id) => {
                const currentContent: Content = epoc.contents[id];
                currentContent.id = id;
                if (currentContent.type === 'assessment') {
                    currentContent.scoreTotal = calcScoreTotal(epoc, currentContent.questions);
                    currentContent.chapterId = chapterId;
                    chapter.time += currentContent.questions.length;
                    chapter.assessments.push(id);
                    if (currentContent.scoreTotal > 0) {
                        epoc.assessments.push(currentContent);
                    }
                } else if (
                    currentContent.type === 'simple-question' &&
                    Number(epoc.questions[currentContent.question].score) > 0
                ) {
                    currentContent.scoreTotal = calcScoreTotal(epoc, [currentContent.question]);
                    currentContent.questions = [currentContent.question];
                    currentContent.chapterId = chapterId;
                    chapter.assessments.push(id);
                    epoc.assessments.push(currentContent);
                } else if (currentContent.type === 'video' || currentContent.type === 'audio') {
                    chapter.mediaCount++;
                    chapter.time += 3;
                }
                return currentContent;
            });
            chapter.time = chapter.duration ? chapter.duration : chapter.time;
            chapter.assessmentCount = chapter.assessments.length;
        }

        pluginService.init(_rootFolder.value, epoc);

        return epoc;
    }

    /**
     * Calculate the total score for a set of questions
     */
    function calcScoreTotal(epoc: Epoc, questions: uid[]): number {
        return questions.reduce((total, questionId) => total + Number(epoc.questions[questionId].score), 0);
    }

    /**
     * Calculate the score for a question based on user responses
     */
    function calcScore(scoreMax: number, correction: any, userResponses: any): number {
        return isUserResponsesCorrect(correction, userResponses) ? +scoreMax : 0;
    }

    /**
     * Check if the learner's responses are correct
     */
    function isUserResponsesCorrect(correction: any, userResponses: any): boolean {
        if (typeof correction === 'string') {
            return userResponses.join('') === correction;
        } else {
            correction = correction as Array<any>;
            if (correction.length > 0 && correction[0].values) {
                return correction.every((group, index) => {
                    return (
                        JSON.stringify(group.values.sort()) ===
                        JSON.stringify(userResponses[index].map((r: any) => r.value).sort())
                    );
                });
            } else {
                return JSON.stringify(correction.sort()) === JSON.stringify(userResponses.sort());
            }
        }
    }

    async function epocMainMenu(chapterIndex?: number, chapter?: Chapter) {
        if (!_epoc.value) return;

        const buttons = [
            {
                text: i18n.global.t('FLOATING_MENU.GENERAL'),
                cssClass: 'separator',
            },
            ...(!isPreview.value
                ? [
                    {
                        text: i18n.global.t('FLOATING_MENU.HOME'),
                        icon: homeOutline,
                        handler: () => {
                            router.push('/library');
                        },
                    },
                ]
                : [
                    {
                        text: i18n.global.t('ABOUT_PAGE.ABOUT'),
                        icon: informationCircleOutline,
                        handler: () => {
                            router.push('/about');
                        },
                    },
                ]),
            {
                text: i18n.global.t('FLOATING_MENU.SETTINGS'),
                icon: settingsOutline,
                handler: () => {
                    router.push('/settings');
                },
            },
            {
                text: i18n.global.t('FLOATING_MENU.THIS_EPOC'),
                cssClass: 'separator',
            },
            ...(router.currentRoute.value.name !== 'OverviewEditorPage' &&  router.currentRoute.value.name !== 'EpocOverviewPage'
                ? [
                    {
                        text: i18n.global.t('FLOATING_MENU.ABOUT'),
                        icon: cubeOutline,
                        handler: () => {
                            const ePocId = _epoc.value!.id;
                            const isLocal = ePocId.startsWith('local-');
                            const libraryId = isLocal ? 'local-epocs' : libraryStore.findCollectionByEpocId(ePocId);

                            if (!libraryId) {
                                console.error('Library not found for ePoc ID:', ePocId);
                                return;
                            }

                            router.push(`/${libraryId}/${_epoc.value!.id}`);
                        },
                    },
                ]
                : []),
            ...(!router.currentRoute.value.path.includes('/epoc/toc/' + _epoc.value!.id)
                ? [
                      {
                          text: i18n.global.t('FLOATING_MENU.TOC'),
                          icon: listCircleOutline,
                          handler: () => {
                              router.push('/epoc/toc/' + _epoc.value!.id);
                          },
                      },
                  ]
                : []),
            {
                text: i18n.global.t('FLOATING_MENU.SCORE_DETAILS'),
                icon: starOutline,
                handler: () => {
                    router.push('/epoc/score/' + _epoc.value!.id);
                },
            },
            {
                text: i18n.global.t('FLOATING_MENU.LICENSE'),
                icon: receiptOutline,
                handler: async () => {
                    if (!_epoc.value) return;

                    await displayLicence(_epoc.value, libraryStore.getCollectionLicense(_epoc.value.id));
                },
            },
            {
                text: i18n.global.t('CLOSE'),
                role: 'cancel',
            },
        ];
        const actionSheet = await actionSheetController.create({
            cssClass: 'custom-action-sheet',
            mode: 'ios',
            header: _epoc.value!.title,
            subHeader: chapter && chapter.title ? chapter.title : 'Menu principal',
            buttons,
        });
        document.documentElement.style.setProperty('--thumbnail-url', `url(${_rootFolder.value + _epoc.value!.image})`);
        await actionSheet.present();
    }

    function clear() {
        _epoc.value = null;
        _rootFolder.value = '';
        initialized.value = false;
    }

    return {
        // State
        initialized,
        epoc: _epoc,
        rootFolder: _rootFolder,
        // Actions
        getEpocById,
        initCourseContent,
        calcScoreTotal,
        calcScore,
        isUserResponsesCorrect,
        epocMainMenu,
        clear,
    };
});
