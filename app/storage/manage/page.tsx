import type { Metadata } from 'next';
import ManageClient from './ManageClient';

export const metadata: Metadata = {
  title: '云端曲库',
  description: '管理云端曲库里的音频文件'
};

export default function ManagePage() {
  return <ManageClient />;
}
