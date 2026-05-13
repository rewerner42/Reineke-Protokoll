const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedPath = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedPath];

config.resolver.extraNodeModules = {
  '@reineke/shared': sharedPath,
};

config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'ts',
  'tsx',
];

config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
