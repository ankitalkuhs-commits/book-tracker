#!/usr/bin/env node
// Fails a Play (AAB) build when app.json's version/versionCode were not bumped
// past the last version Play accepted. Warns only (exit 0) without --strict,
// so device-test APK rebuilds at the same versionCode are not blocked.
// No network, no env vars, no child_process — reads two committed JSON files.
'use strict';

const fs = require('fs');
const path = require('path');

const strict = process.argv.includes('--strict');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const lastReleasedPath = path.join(__dirname, '..', 'release', 'last-released.json');

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const lastReleased = JSON.parse(fs.readFileSync(lastReleasedPath, 'utf8'));

const version = appJson.expo.version;
const versionCode = appJson.expo.android.versionCode;
const lastVersion = lastReleased.version;
const lastVersionCode = lastReleased.versionCode;

console.log(`app.json: version=${version} versionCode=${versionCode}`);
console.log(`release/last-released.json: version=${lastVersion} versionCode=${lastVersionCode}`);

const versionCodesAreIntegers = Number.isInteger(versionCode) && Number.isInteger(lastVersionCode);
const bad = !versionCodesAreIntegers || versionCode <= lastVersionCode || version === lastVersion;

if (bad) {
  const message = `app.json versionCode ${versionCode} / version ${version} not bumped past last Play release ${lastVersionCode} / ${lastVersion}`;
  if (strict) {
    console.log(`::error::${message}`);
    process.exit(1);
  }
  console.log(`::warning::${message}`);
  process.exit(0);
}

process.exit(0);
