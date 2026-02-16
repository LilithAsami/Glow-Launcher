import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple JSON-file storage.
 * Each key maps to a separate .json file inside the app's userData/data folder.
 */
export class Storage {
  private basePath: string;

  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'data');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  private filePath(key: string): string {
    // Sanitise key to a safe filename
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.basePath, `${safe}.json`);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = fs.readFileSync(this.filePath(key), 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    fs.writeFileSync(this.filePath(key), JSON.stringify(value, null, 2), 'utf-8');
  }

  async delete(key: string): Promise<void> {
    try {
      fs.unlinkSync(this.filePath(key));
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
