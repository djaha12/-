import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@atelier/db', '@atelier/core'],
}

export default nextConfig
