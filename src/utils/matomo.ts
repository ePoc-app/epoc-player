import { useAppMode } from '@/composables/useAppMode';

const { isEditorPreview } = useAppMode();
// Disabled in dev and in the editor preview, but enabled in HTML/SCORM exports
const isDev = import.meta.env.DEV || isEditorPreview.value;

// A session lasts as long as the same ePoc is used without 30 min of inactivity (same as a Matomo visit)
const SESSION_KEY = 'trackingSession';
const SESSION_TIMEOUT = 30 * 60 * 1000;

type TrackingSession = { epocId: string; lastActivity: number };

// localStorage can be unavailable (e.g. blocked in a third-party iframe of an LMS)
const readSession = (): TrackingSession | null => {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
        return null;
    }
};

const writeSession = (session: TrackingSession) => {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
        // Sessions will be counted on every load
    }
};

const INITIALIZED_EPOCS_KEY = 'trackingInitializedEpocs';

const readInitializedEpocs = (): string[] => {
    try {
        return JSON.parse(localStorage.getItem(INITIALIZED_EPOCS_KEY) || '[]');
    } catch {
        return [];
    }
};

const writeInitializedEpocs = (epocIds: string[]) => {
    try {
        localStorage.setItem(INITIALIZED_EPOCS_KEY, JSON.stringify(epocIds));
    } catch {
        // The learner will be counted on every load
    }
};

const touchSession = () => {
    const session = readSession();
    if (session) writeSession({ ...session, lastActivity: Date.now() });
};

// Track a Page View
export const trackPageView = (url?: string, title?: string) => {
    touchSession();
    if (isDev) {
        console.log('Matomo tracking disabled in dev mode, logging instead');
        console.log('trackPageView', url, title);
        return;
    }
    if (window._paq) {
        if (url) window._paq.push(['setCustomUrl', url]);
        if (title) window._paq.push(['setDocumentTitle', title]);
        window._paq.push(['trackPageView']);
    }
};

// Track a Custom Event
export const trackEvent = (category: string, action: string, name?: string, value?: number) => {
    touchSession();
    if (isDev) {
        console.log('Matomo tracking disabled in dev mode, logging instead');
        console.log('trackEvent', category, action, name, value);
        return;
    }
    if (window._paq) {
        console.log('trackEvent', category, action, name, value);
        window._paq.push(['trackEvent', category, action, name, value]);
    }
};

// Track a session start (xAPI "initialized" then "started" or "resumed") unless the session of this ePoc is still running (reload, back from library)
export const trackSessionStart = (epocId: string, platform: string) => {
    const session = readSession();
    const now = Date.now();
    const isNewSession = !session || session.epocId !== epocId || now - session.lastActivity > SESSION_TIMEOUT;
    writeSession({ epocId, lastActivity: now });
    if (!isNewSession) return;

    trackEvent(epocId, `${epocId} / Session initialized`, platform);

    // Count unique learners (xAPI "started": first session on this device) and returning ones (xAPI "resumed")
    const initializedEpocs = readInitializedEpocs();
    if (initializedEpocs.includes(epocId)) {
        trackEvent(epocId, `${epocId} / Resumed`, platform);
    } else {
        writeInitializedEpocs([...initializedEpocs, epocId]);
        trackEvent(epocId, `${epocId} / Started`, platform);
    }
};
