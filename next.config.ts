import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Externalize Cesium to avoid bundling issues
      config.externals = {
        ...config.externals,
        cesium: 'Cesium',
      };

      // Node.js fallbacks for browser environment
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        url: false,
        module: false,
        worker_threads: false,
        https: false,
        http: false,
        util: false,
        zlib: false,
        stream: false,
        assert: false,
        buffer: false,
        crypto: false,
        events: false,
        os: false,
        querystring: false,
      };
    }

    return config;
  },

  // Image configuration for external domains
  images: {
    domains: [
      'cesiumjs.org',
      'cesium.com',
      'assets.cesium.com',
      'ion.cesium.com',
    ],
  },
};

export default nextConfig;