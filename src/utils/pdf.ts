import { jsPDF } from 'jspdf';
import { i18n } from '@/i18n';
import { useUser } from '@/composables';
import { trackEvent } from './matomo';
import type { Epoc } from '@/types/epoc';
import { uid } from '@epoc/epoc-types/dist/v1';
import shapeSvg from '@/assets/icon/badge/shape.svg?url';
import shadowGreySvg from '@/assets/icon/badge/shadow-grey.svg?url';
import lockedBadgeSvg from '@/assets/icon/badge/locked.svg?url';

const badgeIcons = import.meta.glob('../assets/icon/badge/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const colors = {
    darkblue: '#384257',
    blue: '#6477A0',
    orange: '#FFA029',
    lightblue: '#edf3f8',
};

export async function generatePdf(epoc: Epoc, rootFolder: string, unlockedBadges: uid[], isInriaEpoc = false): Promise<jsPDF> {
    const { user } = useUser();

    const password = Math.random().toString(36).substring(2, 12);
    const doc = new jsPDF({
        orientation: 'portrait',
        compress: true,
        encryption: {
            userPermissions: ['print'],
            ownerPassword: password,
        },
    });

    const img = new Image();
    const centeredText = (text: string, y: number) => {
        const textWidth = (doc.getStringUnitWidth(text) * doc.getFontSize()) / doc.internal.scaleFactor;
        const textOffset = (doc.internal.pageSize.width - textWidth) / 2;
        doc.text(text, textOffset, y);
    };

    img.src = 'assets/img/fond-attestation.png';
    doc.addImage(img, 'PNG', 0, 0, 210, 297);
    const logoUrl = getLogoUrl(epoc, rootFolder, isInriaEpoc);
    if (logoUrl) await insertLogo(doc, logoUrl);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(colors.orange);
    centeredText(i18n.global.t('PLAYER.SCORE.CERTIFICATE_PDF.COMPLETION_CERTIFICATE'), 90);
    doc.setFontSize(18);
    doc.setTextColor(colors.darkblue);
    centeredText(epoc.title, 110);
    doc.setFillColor(colors.orange);
    doc.roundedRect(90, 120, 30, 1, 1, 1, 'F');

    let posY = 130;

    if (epoc.badges && Object.values(epoc.badges).length > 0) {
        doc.setFontSize(12);
        doc.setFont('Helvetica', 'normal');
        centeredText('Badges', posY);
        posY = await insertBadges(epoc, rootFolder, unlockedBadges, doc, posY + 10);
    }

    doc.setFontSize(12);
    doc.setFont('Helvetica', 'normal');
    centeredText(i18n.global.t('PLAYER.SCORE.CERTIFICATE_PDF.AUTHORS'), posY);
    doc.setFontSize(10);
    doc.setTextColor(colors.blue);
    posY += 10;

    const margin = 2;
    const date = new Date();
    Object.values(epoc.authors).forEach((author, index, array) => {
        if (index % 2 === 0) {
            if (index === array.length - 1) {
                centeredText(author.name, posY);
                posY += 6;
            } else {
                const textWidth = (doc.getStringUnitWidth(author.name) * doc.getFontSize()) / doc.internal.scaleFactor;
                doc.text(author.name, 104 - margin - textWidth, posY);
            }
        } else {
            doc.text(author.name, 104 + margin, posY);
            posY += 6;
        }
    });

    doc.setTextColor(colors.darkblue);
    centeredText(
        `${i18n.global.t('PLAYER.SCORE.CERTIFICATE_PDF.EPOC_EDITION')} : ${
            epoc.edition ? epoc.edition : date.getFullYear()
        }`,
        posY
    );
    posY += 6;
    doc.setFillColor(colors.lightblue);
    doc.roundedRect(50, posY, 110, 1, 1, 1, 'F');

    posY += 10;
    doc.setFontSize(12);
    centeredText(i18n.global.t('PLAYER.SCORE.CERTIFICATE_PDF.DELIVERED_TO'), posY);
    posY += 10;
    doc.setFontSize(18);
    doc.setFont('Helvetica', 'bold');
    centeredText(user.value!.firstname + ' ' + user.value!.lastname, posY);
    posY += 7;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    centeredText(
        `${i18n.global.t('PLAYER.SCORE.CERTIFICATE_PDF.DELIVERED_THE')} ${
            i18n.global.locale.value === 'fr' ? date.toLocaleDateString('fr') : date.toLocaleDateString('en-US')
        }`,
        posY
    );
    const id = Math.floor(Math.random() * 10000000);
    posY += 7;
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    centeredText(`N°${id}`, posY);
    trackEvent(epoc.id, `${epoc.id} / Certificate generated`, `${epoc.id} / Certificate generated / n°${id} (${password})`);

    return doc;
}

function svgToPNG(url: string, width: number): Promise<string | null> {
    return new Promise((resolve) => {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            document.body.appendChild(img);
            const canvas = document.createElement('canvas');
            const ratio = img.clientWidth / img.clientHeight || 1;
            document.body.removeChild(img);
            canvas.width = width;
            canvas.height = width / ratio;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
                const data = canvas.toDataURL('image/png');
                resolve(data);
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => {
            resolve(null);
        };
        img.src = url;
    });
}

// Inria Learning Lab logo for Inria ePocs, otherwise the publisher logo defined in the ePoc (if any)
function getLogoUrl(epoc: Epoc, rootFolder: string, isInriaEpoc: boolean): string | undefined {
    if (isInriaEpoc) return 'assets/img/logo-ill.png';

    const logo = epoc.publisher?.logo;
    if (!logo) return undefined;
    return /^(https?|file):\/\//.test(logo) ? logo : rootFolder + logo;
}

// Top right corner, facing the ePoc logo of the background
async function insertLogo(doc: jsPDF, url: string) {
    const maxWidth = 50;
    const maxHeight = 16;
    const right = 186;
    const centerY = 27;

    const data = await svgToPNG(url, 600);
    if (!data) return;

    const { width, height } = doc.getImageProperties(data);
    const scale = Math.min(maxWidth / width, maxHeight / height);
    const w = width * scale;
    const h = height * scale;
    doc.addImage(data, 'PNG', right - w, centerY - h / 2, w, h);
}

async function insertBadges(
    epoc: Epoc,
    rootFolder: string,
    unlockedBadges: uid[],
    doc: jsPDF,
    posY: number
): Promise<number> {
    const badges = Object.entries(epoc.badges);

    const w = 20;
    const h = w * 1.111;
    const size = w * 0.4;
    const offset = 25;
    const center = doc.internal.pageSize.width / 2;
    const startX = center - badges.length * (offset / 2);

    let x = startX;
    const y = posY;

    for (const [key, badge] of badges) {
        let url;
        if (!badge.icon.endsWith('.svg')) {
            url = badgeIcons[`../assets/icon/badge/${badge.icon}.svg`] || `/assets/icon/badge/${badge.icon}.svg`;
        } else {
            url = rootFolder + badge.icon;
        }

        if (unlockedBadges.includes(key)) {
            const bg = await svgToPNG(shapeSvg, 500);
            if (bg) doc.addImage(bg, 'PNG', x, y, w, h);
            try {
                const icon = await svgToPNG(url, 500);
                if (icon) doc.addImage(icon, 'PNG', x + 6, y + 6, size, size);
            } catch (e) {
                console.log(url);
            }
            const fg = await svgToPNG(shadowGreySvg, 500);
            if (fg) doc.addImage(fg, 'PNG', x, y, w, h);
        } else {
            const bg = await svgToPNG(lockedBadgeSvg, 500);
            if (bg) doc.addImage(bg, 'PNG', x, y, w, h);
        }

        doc.setFontSize(8);
        doc.text(badge.title, x + 10, y + 26, { align: 'center', maxWidth: 20 });
        x += offset;
    }

    return y + 40;
}
