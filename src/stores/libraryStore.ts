import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { actionSheetController, alertController, toastController } from '@ionic/vue';
import {
    listCircleOutline,
    refreshOutline,
    starOutline,
    trash,
    receiptOutline,
    cloudDownloadOutline,
} from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useSettingsStore } from './settingsStore';
import { useReadingStore } from './readingStore';
import type { Epoc, EpocCollection, EpocLibrary, EpocLibraryState, EpocMetadata, License } from '@/types/epoc';
import type { Reading } from '@/types/reading';
import { deleteFolder, download, unzip } from '@/utils/file';
import { readEpocContent } from '@/utils/epocService';
import { displayLicence } from '@/utils/app';
import { i18n } from '@/i18n';
import { trackEvent } from '@/utils/matomo';
import { useAppMode } from '@/composables/useAppMode';

export const useLibraryStore = defineStore('library', () => {
    const settingsStore = useSettingsStore();
    const readingStore = useReadingStore();
    const router = useRouter();
    const { isPreview } = useAppMode();

    const officialCollectionsUrl = 'https://epoc.inria.fr/official-collections.json';
    const illCollectionId = 'fr.inria.learninglab.epocs';
    const illPublisherId = 'fr.inria.learninglab';

    const officialCollections = ref<Record<string, EpocCollection>>({});
    const customCollections = ref<Record<string, EpocCollection>>({});
    const epocProgresses = ref<Record<string, number>>({});
    const readings = ref<Reading[]>([]);

    const collections = computed<Record<string, EpocCollection>>(() => ({
        ...officialCollections.value,
        ...customCollections.value,
    }));

    async function refreshAll () {
        await fetchOfficialCollections();
        await fetchCustomCollections();
    }

    async function fetchCollections(urls: string[]): Promise<Record<string, EpocCollection | null>> {
        const results = await Promise.allSettled(
            urls.map(async (url) => {
                const collectionResponse = await fetch(url, { cache: 'no-cache' });
                if (!collectionResponse.ok) throw new Error(`Failed to fetch collection: ${url}`);
                const collection: EpocCollection = await collectionResponse.json();
                Object.keys(collection.ePocs).forEach((id) => {
                    collection.ePocs[id] = {
                        ...collection.ePocs[id],
                        downloading: false,
                        downloaded: false,
                        unzipping: false,
                        opened: false,
                    };
                });
                collection.url = url;
                return collection;
            })
        );
        return results.reduce((acc, result, index) => {
            if (result.status === 'rejected') {
                console.error(`Error fetching collection ${urls[index]}:`, result.reason);
            }
            acc[urls[index]] = result.status === 'fulfilled' ? result.value : null;
            return acc;
        }, {} as Record<string, EpocCollection | null>);
    }

    async function fetchOfficialCollections() {
        if (isPreview.value) return;
        try {
            const cachedCollections: Record<string, EpocCollection> = JSON.parse(localStorage.getItem('officialCollections') || '{}');
            officialCollections.value = cachedCollections;
            const response = await fetch(officialCollectionsUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error('Failed to fetch official collections');
            const collectionUrls: string[] = await response.json();
            const fetchedCollections = await fetchCollections(collectionUrls);
            const collections = collectionUrls
                .map((url) => fetchedCollections[url] ?? Object.values(cachedCollections).find((c) => c.url === url))
                .filter((collection): collection is EpocCollection => !!collection);
            const collectionsRecord = toCollectionsRecord(collections);
            localStorage.setItem('officialCollections', JSON.stringify(collectionsRecord));
            officialCollections.value = collectionsRecord;
            await checkLocalEpocs(collectionsRecord);
        } catch (error) {
            console.error('Error fetching official collections:', error);
        }
    }

    async function fetchCustomCollections() {
        if (isPreview.value) return;
        try {
            const cachedCustomCollections = JSON.parse(localStorage.getItem('customCollections') || '{}');
            if (settingsStore.settings.customLibrairies.length === 0) {
                customCollections.value = {};
                return;
            }
            const fetchedCollections = await fetchCollections(settingsStore.settings.customLibrairies);
            const collections = Object.values(fetchedCollections).filter(
                (collection): collection is EpocCollection => !!collection
            );
            const collectionsRecord = toCollectionsRecord(collections);
            customCollections.value = collectionsRecord;
            await checkLocalEpocs(collectionsRecord);
        } catch (error) {
            console.error('Error fetching custom collections:', error);
        }
    }

    function toCollectionsRecord(collections: EpocCollection[]): Record<string, EpocCollection> {
        return collections.reduce((acc, collection) => {
            acc[collection.id] = collection;
            return acc;
        }, {} as Record<string, EpocCollection>);
    }

    async function checkLocalEpocs(collectionsRecord: Record<string, EpocCollection>) {
        for (const collection of Object.values(collectionsRecord)) {
            for (const epoc of Object.values(collection.ePocs)) {
                const localEpoc = await readEpocContent('epocs', epoc.id);
                if (localEpoc) {
                    const downloadDate = localEpoc.lastModif
                        ? new Date(localEpoc.lastModif.replace(/-/g, '/'))
                        : new Date();
                    const updateAvailable = new Date(epoc.lastModified) > downloadDate;
                    updateEpocCollectionState(epoc.id, { downloaded: true, updateAvailable }, collection.id);
                }
            }
        }
    }

    function findCollectionByEpocId(epocId: string): string | undefined {
        const [collectionId] = Object.entries(collections.value).find(([_, collection]) => {
            return !!collection.ePocs[epocId];
        }) || [];
        return collectionId;
    }

    function getCollectionLicense(epocId: string): License | undefined {
        if (epocId.startsWith('local-')) return undefined;

        const collectionId = findCollectionByEpocId(epocId);
        return collectionId ? collections.value[collectionId]?.licence : undefined;
    }

    function updateEpocCollectionState(
        epocId: string,
        {
            downloading = false,
            unzipping = false,
            downloaded = false,
            opened,
            updateAvailable = false,
        }: EpocLibraryState,
        collectionId: string
    ) {
        const custom = !!customCollections.value[collectionId];
        const collectionToUpdate = custom ? customCollections.value : officialCollections.value;
        const epoc = collectionToUpdate[collectionId]?.ePocs[epocId];
        if (!epoc) {
            console.warn(`ePoc with id ${epocId} not found in collection ${collectionId}`);
            return;
        }
        epoc.downloading = downloading;
        epoc.downloaded = downloaded;
        epoc.unzipping = unzipping;
        epoc.opened = typeof opened !== 'undefined' ? opened : epoc.opened;
        epoc.updateAvailable = updateAvailable;
        if (custom) {
            customCollections.value = { ...customCollections.value };
        } else {
            officialCollections.value = { ...officialCollections.value };
        }
    }

    function updateEpocProgress(epocId: string, progress: number) {
        epocProgresses.value[epocId] = progress;
    }

    async function downloadEpoc(epoc: EpocMetadata, libraryId: string) {
        updateEpocCollectionState(epoc.id, { downloading: true }, libraryId);
        try {
            await download(epoc.download, `${epoc.id}.zip`, (progress) => {
                updateEpocProgress(epoc.id, progress.bytes / progress.contentLength);
            });
        } catch (error) {
            console.error('Error downloading ePoc:', error);
            updateEpocCollectionState(epoc.id, { downloading: false }, libraryId);
            await presentToast(i18n.global.t('LIBRARY_PAGE.DOWNLOAD_ERROR'), 'danger');
            return;
        }
        unzipEpoc(epoc.id, libraryId);
    }

    async function unzipEpoc(epocId: string, libraryId: string) {
        updateEpocCollectionState(epocId, { unzipping: true }, libraryId);
        try {
            await unzip(`${epocId}.zip`, `epocs/${epocId}`);
            trackEvent(epocId, `${epocId} (${libraryId}) / Imported`);
        } catch (error) {
            console.error('Error unzipping ePoc:', error);
            updateEpocCollectionState(epocId, { unzipping: false }, libraryId);
            return;
        }
        updateEpocCollectionState(epocId, { downloaded: true }, libraryId);
    }

    async function deleteEpoc(epoc: EpocMetadata, libraryId: string) {
        trackEvent(epoc.id, 'Deleted');
        await deleteFolder(`epocs/${epoc.id}`);
        updateEpocCollectionState(epoc.id, {}, libraryId);
        router.push('/library');
    }

    async function checkCustomCollectionUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error('URL unreachable');
            const collection: EpocCollection = await response.json();
            if (!collection || !collection.id || !collection.ePocs) {
                return 'CUSTOM_COLLECTION.ERROR_INVALID';
            }
            if (customCollections.value[collection.id] || officialCollections.value[collection.id]) {
                return 'CUSTOM_COLLECTION.ERROR_DUPLICATE';
            }
            return null;
        } catch (error) {
            return 'CUSTOM_COLLECTION.ERROR_UNREACHABLE';
        }
    }

    async function epocLibraryMenu(epoc: EpocLibrary, libraryId: string) {
        const buttons = [
            {
                text: i18n.global.t('FLOATING_MENU.TOC'),
                icon: listCircleOutline,
                handler: () => router.push(`/epoc/toc/${epoc.id}`),
            },
            {
                text: i18n.global.t('FLOATING_MENU.SCORE_DETAILS'),
                icon: starOutline,
                handler: () => router.push(`/epoc/score/${epoc.id}`),
            },
            {
                text: i18n.global.t('FLOATING_MENU.LICENSE'),
                icon: receiptOutline,
                handler: async () => {
                    await displayLicence(epoc, collections.value[libraryId]?.licence);
                },
            },
            ...(epoc.updateAvailable
                ? [
                      {
                          text: i18n.global.t('FLOATING_MENU.UPDATE'),
                          icon: cloudDownloadOutline,
                          handler: () => {
                              deleteEpoc(epoc, libraryId).then(() => {
                                  downloadEpoc(epoc, libraryId);
                              });
                          },
                      },
                  ]
                : []),
            ...(epoc.opened
                ? [
                      {
                          text: i18n.global.t('FLOATING_MENU.RESET'),
                          icon: refreshOutline,
                          handler: () => confirmReset(epoc, libraryId),
                      },
                  ]
                : []),
            {
                text: i18n.global.t('FLOATING_MENU.DELETE'),
                icon: trash,
                handler: () => confirmDelete(epoc, libraryId),
            },
            {
                text: i18n.global.t('CLOSE'),
                role: 'cancel',
            },
        ];
        const actionSheet = await actionSheetController.create({
            header: epoc.title,
            cssClass: 'custom-action-sheet',
            subHeader: i18n.global.t('FLOATING_MENU.MAIN_MENU'),
            mode: 'ios',
            buttons,
        });
        document.documentElement.style.setProperty('--thumbnail-url', `url(${epoc.image})`);
        await actionSheet.present();
    }

    async function presentToast(message: string, color?: string) {
        const toast = await toastController.create({
            message,
            duration: 2000,
            color,
        });
        await toast.present();
    }

    async function addCustomCollection(url: string) {
        const error = await checkCustomCollectionUrl(url);
        if (error) {
            await presentToast(i18n.global.t(error), 'danger');
            return;
        }
        await presentToast(i18n.global.t('CUSTOM_COLLECTION.SUCCESS'), 'success');
        settingsStore.settings.customLibrairies.push(url);
        settingsStore.updateSettings({});
    }

    async function confirmReset(epoc: EpocLibrary, libraryId: string) {
        const alert = await alertController.create({
            header: 'Confirmation',
            message: `Attention la réinitialisation de l'ePoc <b>"${epoc.title}"</b> supprimera toute votre progression`,
            buttons: [
                {
                    text: 'Annuler',
                    role: 'cancel',
                    cssClass: 'secondary',
                },
                {
                    text: 'Confirmer',
                    handler: () => {
                        readingStore.removeReading(epoc.id);
                        updateEpocCollectionState(epoc.id, { downloaded: epoc.downloaded, opened: false }, libraryId);
                    },
                },
            ],
        });
        await alert.present();
    }

    async function confirmDelete(epoc: EpocMetadata, libraryId: string) {
        const alert = await alertController.create({
            header: 'Confirmation',
            message: `Merci de confirmer la suppression de l'ePoc <b>"${epoc.title}"</b>`,
            buttons: [
                {
                    text: 'Annuler',
                    role: 'cancel',
                    cssClass: 'secondary',
                },
                {
                    text: 'Confirmer',
                    handler: () => {
                        deleteEpoc(epoc, libraryId);
                    },
                },
            ],
        });
        await alert.present();
    }

    function isInriaEpoc(epoc: Epoc): boolean {
        if (epoc.publisher) return epoc.publisher.id === illPublisherId;
        return !epoc.id.startsWith('local-') && findCollectionByEpocId(epoc.id) === illCollectionId;
    }

    fetchOfficialCollections().then();
    watch(
        () => settingsStore.settings.customLibrairies.join('\n'),
        () => fetchCustomCollections()
    );
    readingStore.$subscribe((_, state) => {
        readings.value = state.readings;
    });

    return {
        officialCollections,
        customCollections,
        epocProgresses,
        collections,
        refreshAll,
        fetchOfficialCollections,
        fetchCustomCollections,
        findCollectionByEpocId,
        getCollectionLicense,
        isInriaEpoc,
        updateEpocCollectionState,
        updateEpocProgress,
        downloadEpoc,
        unzipEpoc,
        deleteEpoc,
        checkCustomCollectionUrl,
        epocLibraryMenu,
        presentToast,
        addCustomCollection,
        confirmReset,
        confirmDelete,
    };
});
