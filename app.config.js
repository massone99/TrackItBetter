// app.json is the source of truth. APP_VARIANT=dev builds a separate development app ("TrackItBetter Dev",
// package com.trackitbetter.app.dev) that installs next to the released one instead of replacing it.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'dev') return config;
  return {
    ...config,
    name: `${config.name} Dev`,
    scheme: `${config.scheme}-dev`,
    android: { ...config.android, package: `${config.android.package}.dev` },
    ios: config.ios ? { ...config.ios, bundleIdentifier: config.ios.bundleIdentifier ? `${config.ios.bundleIdentifier}.dev` : undefined } : config.ios,
  };
};
