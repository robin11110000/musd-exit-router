/** @type {import('next').NextConfig} */
const nextConfig = {
    distDir: process.env.NODE_ENV === 'production' ? '.next-production' : '.next',
    experimental: { outputFileTracingRoot: __dirname },
    async redirects() {
      return [{ source: '/', destination: '/capital', permanent: false }];
    },
    webpack: (config) => {
      config.resolve.alias['@react-native-async-storage/async-storage'] =
        require('path').resolve(__dirname, 'src/shims/empty.js');
      return config;
    },
  };
  module.exports = nextConfig;
