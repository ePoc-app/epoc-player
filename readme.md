# ePoc Player

**ePoc** (Electronic Pocket Open Course) is a free and open-source micro-learning solution developed by [Inria](https://www.inria.fr).
It includes a file format, a mobile and web player, and a desktop content editor. Its goal is to make it easy to create and share learning content while respecting privacy and promoting free software.

> **Micro-learning** delivers short, focused content designed to be consulted quickly. It lets learners progress step by step, fits into everyday life and suits mobile use.

This repository contains the **player** part of the solution. It reads and imports courses in the ePoc format and runs on:

- **Android** and **iOS** (native apps built with Capacitor)
- **Web** (progressive web app)
- **Editor preview / standalone HTML / SCORM** (a single-course build used by [ePoc Editor](https://gitlab.inria.fr/learninglab/epoc/epoc-editor) for its live preview and for standalone or SCORM 1.2 / 2004 exports)

No account is needed: learners open content directly. The player runs on its own and depends on no external service. There is no backend, only a file server to download content.
A collection of Inria ePocs about digital topics is available in the app.

More information: [epoc.inria.fr](https://epoc.inria.fr)

## Tech stack

[Vue 3](https://vuejs.org) · [Ionic](https://ionicframework.com) · [Capacitor](https://capacitorjs.com) · [Vite](https://vitejs.dev) · TypeScript · Pinia

## Requirements

* Recent version of Node and npm
* Ionic CLI `npm install -g @ionic/cli`
* For iOS:
    * Xcode [(guide)](https://ionicframework.com/docs/developing/ios)
    * Enable Xcode command line tools `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
    * CocoaPods `sudo gem install cocoapods`
* For Android: Android Studio [(guide)](https://ionicframework.com/docs/developing/android)

## Getting started

```bash
# Install dependencies
npm i
```

### Web

```bash
# Serve the app in the browser (http://localhost:8100)
npm run dev

# Build the app (output in dist/)
npm run build
```

### Editor preview / standalone / SCORM

The `preview` mode (`VITE_APP_MODE=preview`) builds a player restricted to a single ePoc: no library, no service worker, no analytics.
It is the artifact consumed by ePoc Editor, both for its local preview and for standalone HTML and SCORM exports.
The ePoc to open can be given with the `?epocId=` URL parameter. When the page is launched by an LMS, the player detects the SCORM API (1.2 or 2004) and reports progress to it.

```bash
# Serve in preview mode
npm run dev-preview

# Build in preview mode (relative base, as done in CI)
npm run build-preview -- -- --base=./
```

The GitLab CI builds this artifact on `master` and publishes it as `preview.zip`.

### Mobile (Android / iOS)

Create a `.env` file at the root to choose the target device (list them with `npx cap run android --list` or `npx cap run ios --list`):

```bash
ANDROID_TARGET=--target=<device-id>
IOS_TARGET=--target=<device-id>
```

```bash
# Generate icons/splash, sync and run on the device
npm run android
npm run ios

# Same with live reload (requires `npm run dev` running)
npm run android-dev
npm run ios-dev

# Open the native project in Android Studio / Xcode to build a release
npm run android-release
npm run ios-release
```

On Android, you may need to invalidate caches (`File > Invalidate Caches / Restart`) and sync Gradle files.

More info: [Android](https://ionicframework.com/docs/developing/android) · [iOS](https://ionicframework.com/docs/developing/ios)

## Store publishing (fastlane)

Store texts live in `fastlane/metadata` (iOS and Android, one folder per locale) and the version comes from `package.json`. Build numbers are computed from the stores (latest + 1).

Setup: Ruby ≥ 3.2 recommended, `bundle install`, then copy `fastlane/.env.example` to `fastlane/.env` and fill in the API keys and Android keystore.

```bash
npm run store:screenshots              # localized screenshots (--lang fr,en --device iphone,ipad,android,android-tablet)

bundle exec fastlane ios pull_metadata     # download current store texts
bundle exec fastlane ios metadata screenshots:true
bundle exec fastlane ios beta              # build + TestFlight
bundle exec fastlane ios release           # submit latest TestFlight build for review

bundle exec fastlane android pull_metadata
bundle exec fastlane android metadata
bundle exec fastlane android beta          # build + internal track
bundle exec fastlane android release       # promote internal to production (rollout:0.2 for staged)
```

Screenshots are generated from the web app with Playwright (`scripts/store-screenshots`, captions in `captions.json`) and are not committed.
The same script renders one App Store creative asset per locale (`fastlane/creative-assets/<locale>/header-search.png`, 16:9, used as product page header and search results asset on iOS 27+). fastlane cannot upload it yet: add it in App Store Connect > Asset Library.

## Tests and lint

```bash
npm run test:unit   # Vitest
npm run test:e2e    # Cypress
npm run lint        # ESLint
```

## License

[CeCILL-B](LICENSE) © Inria
