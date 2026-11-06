import {defineStore} from 'pinia';
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import { OnboardingItem } from '@/types/onboarding';

export const useOnboardingStore = defineStore('onboarding', () => {
    const onboarding = ref<OnboardingItem[]>([]);
    const removedOnboarding = ref<string[]>(JSON.parse(localStorage.getItem('removedOnboarding') || '[]'));
    const {locale} = useI18n();
    
    const getOnboarding = computed(() => onboarding.value);

    const onboardingUrls: Record<string, string> = {
        fr: 'https://epoc.inria.fr/onboarding.json',
        en: 'https://epoc.inria.fr/onboarding-en.json'
    };

    async function fetchOnboarding() {
        const lang = locale.value;
        const url = onboardingUrls[onboardingUrls[lang] ? lang : 'fr'];
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Failed to fetch onboarding: ${response.statusText}`);
            const data: OnboardingItem[] = await response.json();
            onboarding.value = data.filter(item => !removedOnboarding.value.includes(item.id));
        } catch (error) {
            console.error('Failed to fetch onboarding data:', error);
        }
    }

    async function removeOnboarding(id: string) {
        onboarding.value = onboarding.value.filter(item => item.id !== id);
        removedOnboarding.value.push(id);
        localStorage.setItem('removedOnboarding', JSON.stringify(removedOnboarding.value));
    }

    fetchOnboarding();
    console.log('Initial onboarding data:', onboarding.value);
    watch(locale, () => {
        fetchOnboarding();
    });

    return {
        getOnboarding,
        fetchOnboarding,
        removeOnboarding
    };
});