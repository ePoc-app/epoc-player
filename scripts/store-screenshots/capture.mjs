// Generates localized App Store / Play Store screenshots from the web build.
// Usage: node scripts/store-screenshots/capture.mjs [--lang fr,en] [--device iphone,ipad]
//
// Library screens come from a regular dev server, ePoc screens from a "preview"
// dev server that reads the demo ePocs unzipped in public/assets/demo/epocs.
// The library is shown with a community collection (ePocs made by teachers on
// forge.apps.education.fr) injected after the Inria collection.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const captions = JSON.parse(readFileSync(join(root, 'scripts/store-screenshots/captions.json'), 'utf8'));
const fastlaneDir = join(root, 'fastlane');
const demoDir = join(root, 'public/assets/demo/epocs');
const captionFont = readFileSync(join(root, 'public/assets/font/inria/InriaSans-Bold.woff2')).toString('base64');

const APP_PORT = 8190;
const PREVIEW_PORT = 8191;
const app = `http://localhost:${APP_PORT}`;
const preview = `http://localhost:${PREVIEW_PORT}`;

const INRIA_COLLECTION_URL = 'https://epoc.inria.fr/collection-ill.json';
const INRIA_COLLECTION_ID = 'fr.inria.learninglab.epocs';
const COMMUNITY_COLLECTION_URL = `${app}/store-screenshots/community-collection.json`;
const COMMUNITY_FORGE = 'https://epoc.forge.apps.education.fr';

// Demo ePocs: local folder name -> download URL. Captured ePoc screens use Inria ePocs,
// community ePocs only appear in the library (and in the editor preview).
const DEMO_EPOCS = {
    E013JM: 'https://epoc.inria.fr/dl/E013JM/E013JM.epoc',
    E006PE: 'https://epoc.inria.fr/dl/E006PE/E006PE.zip',
    E009LL: 'https://epoc.inria.fr/dl/E009LL/E009LL.zip',
    'premiers-pas': `${COMMUNITY_FORGE}/adultes_divers_Premiers-pas-V3.epoc`,
    gtfs: `${COMMUNITY_FORGE}/seconde_SNT_design_ton_GTFS.epoc`,
    osm: `${COMMUNITY_FORGE}/seconde_SNT_epoc_osm.epoc`,
    'guerre-froide': `${COMMUNITY_FORGE}/3eme_histoire_Guerre_froide.epoc`,
};
const COMMUNITY_EPOCS = ['premiers-pas', 'gtfs', 'osm', 'guerre-froide'];

// App lang -> store locale folders
const LOCALES = {
    fr: { ios: 'fr-FR', android: 'fr-FR' },
    en: { ios: 'en-US', android: 'en-US' },
    de: { ios: 'de-DE', android: 'de-DE' },
    es: { ios: 'es-ES', android: 'es-ES' },
    it: { ios: 'it', android: 'it-IT' },
};

// Viewport (CSS px) x scale = final store size. deliver detects the iOS device from the image size.
const DEVICES = {
    iphone: { ua: devices['iPhone 15 Pro Max'].userAgent, width: 430, height: 932, scale: 3,
        out: (loc, i) => join(fastlaneDir, 'screenshots/ios', loc.ios, `${i}_iphone.png`) },
    ipad: { ua: devices['iPad Pro 11'].userAgent, width: 1024, height: 1366, scale: 2,
        out: (loc, i) => join(fastlaneDir, 'screenshots/ios', loc.ios, `${i}_ipad.png`) },
    android: { ua: devices['Pixel 7'].userAgent, width: 360, height: 640, scale: 3,
        out: (loc, i) => join(fastlaneDir, 'metadata/android', loc.android, 'images/phoneScreenshots', `${i}.png`) },
    'android-tablet': { ua: devices['Galaxy Tab S4'].userAgent, width: 800, height: 1280, scale: 2,
        out: (loc, i) => join(fastlaneDir, 'metadata/android', loc.android, 'images/tenInchScreenshots', `${i}.png`) },
};

// seed: reading progress injected before the capture (chapters fully done, contents viewed in the next one, badges)
// App Store creative assets (iOS 27+), one of each per locale:
// - product page header, 16:9. Only a band around the middle stays visible: the navigation bars cover the top
//   and the app card (icon, name, Get) covers the bottom, about 30-55% of the height on both iPhone and iPad,
//   and iPhone also crops the sides (about 17-83% of the width). Checked with the App Store Connect preview.
// - search results, 3:2, showing the interface.
const CREATIVE = {
    header: { width: 2622, height: 1475, scale: 2, out: (loc) => join(fastlaneDir, 'creative-assets', loc.ios, 'header.png') },
    search: { width: 1920, height: 1280, scale: 2, scenes: ['content', 'library', 'score'],
        out: (loc) => join(fastlaneDir, 'creative-assets', loc.ios, 'search.png') },
};

const SCENES = [
    { id: 'library', url: `${app}/library`, wait: '.library-item' },
    { id: 'content', url: `${preview}/epoc/play/E013JM/vw11xr/content/icew5l`, wait: 'video' },
    { id: 'create', url: `${preview}/epoc/preview-editor/premiers-pas` },
    { id: 'score', url: `${preview}/epoc/score/E006PE`, wait: '.score',
        seed: { epocId: 'E006PE' },
        // On short screens, scroll down to the score bar so the unlocked badges are visible
        action: (page) => page.evaluate(() => {
            if (document.querySelector('.certificate').getBoundingClientRect().bottom + 150 > window.innerHeight) {
                document.querySelector('.score').scrollIntoView({ block: 'start' });
            }
        }) },
    { id: 'quiz', url: `${preview}/epoc/premiers-pas/assessment/53wjqp` },
    { id: 'inria', url: `${app}/${INRIA_COLLECTION_ID}`, wait: '.library-item, ion-card, img' },
    { id: 'privacy', url: `${preview}/epoc/toc/E009LL`, wait: '.toc-chapter',
        seed: { epocId: 'E009LL', doneChapters: 2, viewedContents: 2 },
        action: (page) => page.locator('.toc-chapter-info-details').nth(2).click() },
];

function parseList(flag, all) {
    const i = process.argv.indexOf(flag);
    return i > -1 ? process.argv[i + 1].split(',') : all;
}

function ensureDemoEpocs() {
    for (const [id, url] of Object.entries(DEMO_EPOCS)) {
        const dir = join(demoDir, id);
        if (existsSync(join(dir, 'content.json'))) continue;
        const zip = join(root, `.tmp-${id}.zip`);
        console.log(`Downloading demo ePoc ${id}…`);
        execFileSync('curl', ['-sfL', '-o', zip, url]);
        mkdirSync(dir, { recursive: true });
        execFileSync('unzip', ['-qo', zip, '-d', dir]);
        rmSync(zip);
    }
}

function communityCollection(lang) {
    const ePocs = {};
    for (const id of COMMUNITY_EPOCS) {
        const content = JSON.parse(readFileSync(join(demoDir, id, 'content.json'), 'utf8'));
        const image = `${app}/assets/demo/epocs/${id}/${content.image.replace(/\\/g, '/').replace(/^\.\//, '')}`;
        ePocs[id] = { id, title: content.title, image, thumbnail: image, download: DEMO_EPOCS[id], summary: content.summary };
    }
    return {
        id: 'store-screenshots.community',
        title: captions[lang].communityCollection,
        description: '',
        publisher: { id: 'store-screenshots.community', name: 'ePoc', website: COMMUNITY_FORGE },
        url: COMMUNITY_COLLECTION_URL,
        ePocs,
    };
}

function startServer(port, env = {}) {
    const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
        cwd: root, env: { ...process.env, ...env }, stdio: 'ignore', detached: true,
    });
    return proc;
}

async function waitForServer(url, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if ((await fetch(url)).ok) return;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Server ${url} did not start`);
}

function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Keep hyphenated words (micro-formations) on one line
function captionHtml(caption) {
    return escapeHtml(caption).replace(/\S+-\S+/g, (word) => `<span style="white-space: nowrap">${word}</span>`);
}

function frameHtml(device, caption, screenshot) {
    const tablet = device.width > 600;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        @font-face { font-family: 'Inria Sans'; font-weight: 700; src: url(data:font/woff2;base64,${captionFont}); }
        * { margin: 0; box-sizing: border-box; }
        html, body { width: ${device.width}px; height: ${device.height}px; overflow: hidden; }
        body { background: #F4F7FB; font-family: 'Inria Sans', sans-serif; display: flex; flex-direction: column; align-items: center; }
        .caption { height: ${tablet ? 20 : 23}%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0 ${tablet ? 12 : 7}%; text-align: center; }
        h1 { color: #384257; font-size: ${tablet ? 54 : 29}px; line-height: 1.15; font-weight: 700; }
        .bar { width: ${tablet ? 72 : 44}px; height: ${tablet ? 6 : 4}px; border-radius: 3px; background: #e63312; margin-top: ${tablet ? 22 : 14}px; }
        .screen { width: ${tablet ? 80 : 84}%; flex: 1; border-radius: ${tablet ? 28 : 26}px ${tablet ? 28 : 26}px 0 0; overflow: hidden;
            background: url('data:image/png;base64,${screenshot.toString('base64')}') top center / 100% auto no-repeat;
            box-shadow: 0 10px 40px rgba(56, 66, 87, .25); border: ${tablet ? 6 : 5}px solid #fff; border-bottom: 0; }
    </style></head><body><div class="caption"><h1>${captionHtml(caption)}</h1><div class="bar"></div></div><div class="screen"></div></body></html>`;
}

const creativeStyle = (size) => `
    @font-face { font-family: 'Inria Sans'; font-weight: 700; src: url(data:font/woff2;base64,${captionFont}); }
    * { margin: 0; box-sizing: border-box; }
    html, body { width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
    body { background: radial-gradient(ellipse at 50% 120%, #FFE3DB 0%, #F4F7FB 60%); font-family: 'Inria Sans', sans-serif; }
    h1 { color: #384257; font-weight: 700; text-align: center; line-height: 1.1; }
    .bar { border-radius: 5px; background: #e63312; }`;

function headerHtml(caption, covers) {
    const { width, height } = CREATIVE.header;
    // Three covers on each side of the caption, inside the visible band
    const slots = [[40, 430, -6], [330, 560, 4], [90, 800, 3]];
    const cards = covers.slice(0, 6).map((url, i) => {
        const [x, y, angle] = slots[i % 3];
        const left = i < 3 ? x : width - x - 260;
        return `<div class="cover" style="left: ${left}px; top: ${y}px; transform: rotate(${i < 3 ? angle : -angle}deg);
            background-image: url('${url}')"></div>`;
    }).join('');
    return `<!doctype html><html><head><style>${creativeStyle(CREATIVE.header)}
        .cover { position: absolute; width: 260px; height: 260px; border-radius: 40px; border: 8px solid #fff;
            background: #fff center / cover no-repeat; box-shadow: 0 16px 50px rgba(56, 66, 87, .22); }
        .title { position: absolute; left: 0; right: 0; top: ${Math.round(height * 0.37)}px; display: flex; flex-direction: column; align-items: center; }
        h1 { font-size: 100px; }
        .bar { width: 130px; height: 10px; margin-top: 40px; }
    </style></head><body>${cards}<div class="title"><h1>${captionHtml(caption)}</h1><div class="bar"></div></div></body></html>`;
}

function searchHtml(caption, screenshots) {
    const phones = screenshots.map((png, i) => `<div class="phone${i === 1 ? ' main' : ''}"
        style="background-image: url('data:image/png;base64,${png.toString('base64')}')"></div>`).join('');
    return `<!doctype html><html><head><style>${creativeStyle(CREATIVE.search)}
        body { display: flex; flex-direction: column; align-items: center; padding-top: 110px; }
        h1 { font-size: 96px; }
        .bar { width: 110px; height: 9px; margin: 36px 0 60px; }
        .phones { display: flex; align-items: flex-start; gap: 60px; }
        .phone { width: 430px; height: 932px; border-radius: 52px; border: 10px solid #fff; background: top center / 100% auto no-repeat;
            box-shadow: 0 20px 70px rgba(56, 66, 87, .25); margin-top: 60px; }
        .phone.main { width: 500px; height: 1084px; margin-top: 0; }
    </style></head><body><h1>${captionHtml(caption)}</h1><div class="bar"></div><div class="phones">${phones}</div></body></html>`;
}

async function renderCreative(browser, size, html, file) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(dirname(file), { recursive: true });
    // Apple rejects images with an alpha channel
    await sharp(await page.screenshot()).removeAlpha().png().toFile(file);
    await page.close();
    console.log(`✓ ${file.replace(root + '/', '')}`);
}

async function captureCreative(browser, lang, raws) {
    const covers = Object.values((await (await fetch(INRIA_COLLECTION_URL)).json()).ePocs).map((epoc) => epoc.image);
    const loc = LOCALES[lang];
    await renderCreative(browser, CREATIVE.header, headerHtml(captions[lang].header, covers), CREATIVE.header.out(loc));
    await renderCreative(browser, CREATIVE.search, searchHtml(captions[lang].header, CREATIVE.search.scenes.map((id) => raws[id])),
        CREATIVE.search.out(loc));
}

async function newScenePage(context, lang) {
    const page = await context.newPage();
    // Community collection shown after the Inria one
    await page.route('**/official-collections.json', (route) =>
        route.fulfill({ json: [INRIA_COLLECTION_URL, COMMUNITY_COLLECTION_URL] }));
    await page.route(COMMUNITY_COLLECTION_URL, (route) => route.fulfill({ json: communityCollection(lang) }));
    return page;
}

// Writes a reading (progress, full assessment scores, badges) through the app Pinia stores
async function seedReading(page, seed) {
    await page.evaluate(async ({ epocId, doneChapters, viewedContents = 0, badges }) => {
        const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
        const readingStore = stores.get('reading');
        const epocStore = stores.get('epoc');
        const epoc = epocStore.epoc;
        const assessments = new Map(epoc.assessments.map((a) => [a.id, a]));
        const reading = readingStore.addReading(epocId);
        const chapters = Object.entries(epoc.chapters);
        const done = doneChapters ?? chapters.length;
        reading.chaptersProgress = [];
        reading.assessments = [];
        chapters.slice(0, done + (viewedContents ? 1 : 0)).forEach(([id, chapter], i) => {
            const contents = i < done ? chapter.contents : chapter.contents.slice(0, viewedContents);
            reading.chaptersProgress.push({ id, contents: [...contents] });
            for (const contentId of contents) {
                if (!['assessment', 'simple-question'].includes(epoc.contents[contentId]?.type)) continue;
                const questions = assessments.get(contentId)?.questions;
                const score = questions ? epocStore.calcScoreTotal(epoc, questions) : 0;
                reading.assessments.push({ id: contentId, score, responses: [] });
            }
        });
        reading.badges = badges ? Object.keys(epoc.badges ?? {}) : [];
        await readingStore.saveReadings();
    }, seed);
}

// Returns the raw (unframed) screenshots by scene id
async function capture(browser, deviceName, lang) {
    const device = DEVICES[deviceName];
    const loc = LOCALES[lang];
    const context = await browser.newContext({
        userAgent: device.ua,
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.scale,
        isMobile: true,
        hasTouch: true,
        locale: lang,
    });
    const raws = {};
    for (const [i, scene] of SCENES.entries()) {
        const page = await newScenePage(context, lang);
        await page.goto(scene.url, { waitUntil: 'networkidle' });
        if (scene.wait) await page.locator(scene.wait).first().waitFor();
        if (scene.seed) {
            await seedReading(page, scene.seed);
            await page.reload({ waitUntil: 'networkidle' });
            await page.locator(scene.wait).first().waitFor();
        }
        // Hide the Inria news banner so the library starts with the collections
        await page.addStyleTag({ content: '.onboarding { display: none !important; }' });
        await page.waitForTimeout(1500);
        if (scene.action) await scene.action(page);
        await page.waitForTimeout(1500);
        const raw = await page.screenshot();
        raws[scene.id] = raw;
        await page.close();

        const framePage = await context.newPage();
        await framePage.setContent(frameHtml(device, captions[lang][scene.id], raw), { waitUntil: 'load' });
        await framePage.evaluate(() => document.fonts.ready);
        const file = device.out(loc, i + 1);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, await framePage.screenshot());
        await framePage.close();
        console.log(`✓ ${file.replace(root + '/', '')}`);
    }
    await context.close();
    return raws;
}

const langs = parseList('--lang', Object.keys(LOCALES));
const deviceNames = parseList('--device', Object.keys(DEVICES));

ensureDemoEpocs();
const servers = [startServer(APP_PORT), startServer(PREVIEW_PORT, { VITE_APP_MODE: 'preview' })];
const stopServers = () => servers.forEach((s) => { try { process.kill(-s.pid); } catch { /* already stopped */ } });
process.on('exit', stopServers);
process.on('SIGINT', () => process.exit(130));

try {
    await Promise.all([waitForServer(app), waitForServer(preview)]);
    const browser = await chromium.launch();
    for (const deviceName of deviceNames) {
        // Remove screenshots from a previous run (scene count may have changed)
        for (const lang of langs) {
            for (let i = 1; i <= 10; i++) rmSync(DEVICES[deviceName].out(LOCALES[lang], i), { force: true });
        }
    }
    for (const deviceName of deviceNames) {
        for (const lang of langs) {
            const raws = await capture(browser, deviceName, lang);
            if (deviceName === 'iphone') await captureCreative(browser, lang, raws);
        }
    }
    await browser.close();
} finally {
    stopServers();
}
