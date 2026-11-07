const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm', 'tflite');

// expo-sqlite on web uses SharedArrayBuffer, which requires cross-origin isolation. `enhanceMiddleware`
// only wraps Metro's own requests: Expo CLI serves the HTML page earlier, without these headers, so
// browsers (Firefox, Chrome) are not isolated and the database fails. Add them to every dev server response.
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    if (!this.hasHeader('Cross-Origin-Embedder-Policy')) this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    if (!this.hasHeader('Cross-Origin-Opener-Policy')) this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
  return writeHead.apply(this, args);
};

module.exports = config;
