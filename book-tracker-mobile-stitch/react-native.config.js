// Native autolinking, per platform.
//
// iOS does not offer Google sign-in. Sprint 4G decision E-6 made the iOS build Apple-only:
// `LoginScreen` renders the Google button only when `!appleAvailable`, so on an iPhone the
// control never appears. Linking the SDK there anyway cost us a build:
//
//   [!] The following Swift pods cannot yet be integrated as static libraries:
//   The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
//   which do not define modules.
//
// AppCheckCore arrives through GoogleSignin 9.2.0. The documented workaround is to force
// modular headers for those two pods, which would have worked — and would have shipped
// Google's SDK, its privacy manifest and its data-collection disclosures inside an App Store
// binary that can never call it.
//
// Excluding it on iOS removes the pod conflict at its source and keeps the iOS app honest
// about what it contains. Android is untouched and keeps Google sign-in exactly as it is.
//
// The JS import in LoginScreen stays: the package's JS entry point is safe to import, and
// every call into it is already behind the `!appleAvailable` branch. The one call that was
// NOT behind that branch — `GoogleSignin.configure()` in the mount effect — is now guarded
// by Platform.OS, because an unlinked native module throws when it is used, not when it is
// imported.
module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': {
      platforms: {
        ios: null,
      },
    },
  },
};
