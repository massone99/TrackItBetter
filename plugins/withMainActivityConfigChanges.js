const { withAndroidManifest } = require('expo/config-plugins');

// Configuration changes MainActivity handles itself. Any it leaves out makes Android destroy and recreate
// the activity, and expo-image-picker then fails with "unregistered ActivityResultLauncher" until the
// app is restarted, because its launchers are registered only once per app start.
const HANDLED = [
  'keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'screenLayout', 'uiMode',
  'smallestScreenSize', 'density', 'fontScale', 'locale', 'layoutDirection',
];

function addHandledChanges(manifest) {
  const activities = manifest.manifest.application?.[0]?.activity ?? [];
  const main = activities.find((activity) => activity.$['android:name'] === '.MainActivity');
  if (!main) return manifest;
  const current = (main.$['android:configChanges'] ?? '').split('|').filter(Boolean);
  main.$['android:configChanges'] = [...new Set([...current, ...HANDLED])].join('|');
  return manifest;
}

module.exports = (config) => withAndroidManifest(config, (modConfig) => {
  modConfig.modResults = addHandledChanges(modConfig.modResults);
  return modConfig;
});
module.exports.addHandledChanges = addHandledChanges;
