/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // 前端密码配置（仅用于UI校验）
    NEXT_PUBLIC_SONGLIST_PASSWORD: process.env.SONGLIST_PASSWORD?.trim() || 'daisy2024',
  },
}

module.exports = nextConfig
