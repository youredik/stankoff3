import { apiClient } from './client';
import type { UploadedAttachment } from '@/types';

export const filesApi = {
  upload: async (file: File): Promise<UploadedAttachment> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<UploadedAttachment>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },
};
