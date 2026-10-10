import { mergeConfig } from 'vite';
import frontendConfig from '../frontend/vite.config';

export default mergeConfig(frontendConfig, {
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: frontendConfig.server?.proxy,
  },
});
