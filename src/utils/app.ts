import { i18n } from '@/i18n';
import { alertController, IonicSafeString } from '@ionic/vue';
import { EpocMetadata } from '@epoc/epoc-types/src/v1';
import { License } from '@epoc/epoc-types/src/v1/license';

function htmlLink(url: string, label: string, title = label): string {
    return `<a href="${url}" title="${title}" target="_blank">${label}</a>`;
}

function getAttribution(epoc: EpocMetadata): string {
    const publisher = epoc.publisher;
    if (publisher?.name) {
        return publisher.website ? htmlLink(publisher.website, publisher.name) : publisher.name;
    }

    return Object.values(epoc.authors ?? {}).map(author => author.name).join(', ');
}

export async function displayLicence(epoc: EpocMetadata, fallbackLicense?: License) {
    let message = '';
    const license = epoc.license?.name ? epoc.license : fallbackLicense;

    if (license?.name) {
        const licenseName = license.name;
        const licenseHtml = license.url ? htmlLink(license.url, licenseName) : licenseName;
        const author = getAttribution(epoc);
        const credit = i18n.global.t(author ? 'LICENSE_MODAL.CREDIT_WITH_AUTHOR' : 'LICENSE_MODAL.CREDIT', {
            ePoc: htmlLink('https://epoc.inria.fr/', 'ePoc', i18n.global.t('LICENSE_MODAL.LINK_TITLE')),
            epoc: epoc.title,
            author,
            license: licenseHtml,
        });

        message = i18n.global.t('LICENSE_MODAL.MESSAGE', {
            epoc: epoc.title,
            license: licenseHtml,
            credit,
        });
    } else {
        message = i18n.global.t('LICENSE_MODAL.MESSAGE_NO_LICENSE', {
            epoc: epoc.title,
        });
    }

    const alert = await alertController.create({
        header: i18n.global.t('LICENSE_MODAL.HEADER'),
        message: new IonicSafeString(message),
        buttons: [i18n.global.t('OK')],
    });

    await alert.present();
}
