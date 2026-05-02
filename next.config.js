/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Use standalone output for production deployment (Docker/IBM Cloud)
  output: 'standalone',
  
  // Turbopack configuration
  turbopack: {
    // Ensuring turbopack root is absolute to avoid warnings
    root: process.cwd(),
  },

  // Standard Next.js configuration
  reactStrictMode: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
