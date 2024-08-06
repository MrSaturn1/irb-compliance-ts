/** @type {import('next').NextConfig} */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const nextConfig = {
  distDir: '.next',
  typescript: {
    tsconfigPath: './tsconfig.json',
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    config.resolve.mainFields = ['browser', 'module', 'main'];
    
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: require.resolve('path-browserify'),
        os: require.resolve('os-browserify'),
      };
    }
    
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });

    // Add this to handle the ESM package warning
    config.resolve.alias['supports-color'] = 'supports-color/browser';

    return config;
  },
  swcMinify: true,
};

export default nextConfig;