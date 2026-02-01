import { apiClient } from './client';
import type { Attachment } from '@/types';

export const filesApi = {
  upload: async (file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<Attachment>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },
};
