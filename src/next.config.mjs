/** @type {import('next').NextConfig} */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        path: false,
        os: false,
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
    
    // Add this to resolve '@' imports
    config.resolve.alias['@'] = path.join(__dirname, './');
    
    return config;
  },
  swcMinify: true,
};

export default nextConfig;