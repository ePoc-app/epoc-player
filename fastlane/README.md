fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

### screenshots

```sh
[bundle exec] fastlane screenshots
```

Generate localized store screenshots (iOS + Android) from the web app

----


## iOS

### ios pull_metadata

```sh
[bundle exec] fastlane ios pull_metadata
```

Download the current App Store texts and screenshots (into fastlane/metadata/ios, or path:<dir>)

### ios metadata

```sh
[bundle exec] fastlane ios metadata
```

Upload texts (and screenshots with screenshots:true) to the App Store version being prepared

### ios build

```sh
[bundle exec] fastlane ios build
```

Build a signed App Store IPA (version from package.json, build number = TestFlight latest + 1, or build_number:<n>)

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build and upload to TestFlight

### ios release

```sh
[bundle exec] fastlane ios release
```

Submit the latest TestFlight build of this version for App Store review, with texts and screenshots

----


## Android

### android pull_metadata

```sh
[bundle exec] fastlane android pull_metadata
```

Download the current Play Store texts and images into fastlane/metadata/android

### android metadata

```sh
[bundle exec] fastlane android metadata
```

Upload texts, images and screenshots to the Play Store listing

### android build

```sh
[bundle exec] fastlane android build
```

Build a signed release AAB (version from package.json, version code = Play latest + 1)

### android beta

```sh
[bundle exec] fastlane android beta
```

Build and upload to the internal testing track

### android release

```sh
[bundle exec] fastlane android release
```

Promote the latest internal build to production (rollout:0.2 for a staged rollout), with listing

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
