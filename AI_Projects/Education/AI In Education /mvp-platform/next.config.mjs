/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server runtime (Node) — required for API routes, sessions, SQLite and Ollama.
  // (Previously output:"export" for the static UI prototype.)
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
