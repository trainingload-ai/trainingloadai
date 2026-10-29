import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Public track tools decode files in-process. Keep each file small enough that
// a malformed upload cannot monopolize the Node.js heap or event loop.
export const PUBLIC_TRACK_FILE_MAX_BYTES = 16 * 1024 * 1024;
export const PUBLIC_TRACK_FILE_MAX_FILES = 10;

export const PUBLIC_TRACK_SINGLE_FILE_OPTIONS: MulterOptions = {
  limits: {
    fileSize: PUBLIC_TRACK_FILE_MAX_BYTES,
    files: 1,
  },
};

export const PUBLIC_TRACK_MULTI_FILE_OPTIONS: MulterOptions = {
  limits: {
    fileSize: PUBLIC_TRACK_FILE_MAX_BYTES,
    files: PUBLIC_TRACK_FILE_MAX_FILES,
  },
};
