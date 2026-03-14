/**
 * Auto-updater — checks GitHub releases for newer versions.
 * Downloads the .exe installer and runs it to update.
 */

import { net, app, shell, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const GITHUB_USER = 'STWJXSX';
const GITHUB_REPO = 'Glow-Launcher';
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;

export interface ReleaseInfo {
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  exeDownloadUrl: string | null;
  exeFileName: string | null;
  exeSize: number;
}

function getCurrentVersion(): string {
  return app.getVersion();
}

function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url });
    request.setHeader('User-Agent', 'GLOW-Launcher-Updater');
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Failed to parse release data')); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

export async function checkForUpdate(): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  release?: ReleaseInfo;
}> {
  const currentVersion = getCurrentVersion();

  try {
    const data = await fetchJSON(API_URL);
    const tagName: string = data.tag_name || '';

    if (!isNewerVersion(currentVersion, tagName)) {
      return { hasUpdate: false, currentVersion };
    }

    const exeAsset = data.assets?.find((a: any) => a.name?.endsWith('.exe'));

    const release: ReleaseInfo = {
      tagName,
      name: data.name || tagName,
      body: data.body || '',
      htmlUrl: data.html_url || `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/tag/${tagName}`,
      publishedAt: data.published_at || '',
      exeDownloadUrl: exeAsset?.browser_download_url || null,
      exeFileName: exeAsset?.name || null,
      exeSize: exeAsset?.size || 0,
    };

    return { hasUpdate: true, currentVersion, release };
  } catch (err) {
    console.error('[Updater] Failed to check for updates:', err);
    return { hasUpdate: false, currentVersion };
  }
}

export async function downloadAndInstall(
  url: string,
  filename: string,
  sender?: WebContents,
): Promise<{ success: boolean; error?: string; downloadPath?: string }> {
  const downloadPath = path.join(app.getPath('downloads'), filename);

  const emit = (data: { phase: string; percent: number; downloaded?: number; total?: number }) => {
    if (sender && !sender.isDestroyed()) sender.send('updater:progress', data);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const request = net.request(url);
      request.setHeader('User-Agent', 'GLOW-Launcher-Updater');
      request.on('response', (response) => {
        const total = parseInt((response.headers['content-length'] as string) || '0', 10);
        let downloaded = 0;

        emit({ phase: 'downloading', percent: 0, downloaded: 0, total });

        const writeStream = fs.createWriteStream(downloadPath);
        response.on('data', (chunk) => {
          writeStream.write(chunk);
          downloaded += chunk.length;
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          emit({ phase: 'downloading', percent, downloaded, total });
        });
        response.on('end', () => { writeStream.end(); resolve(); });
        response.on('error', reject);
      });
      request.on('error', reject);
      request.end();
    });

    emit({ phase: 'launching', percent: 100 });

    // shell.openPath triggers UAC elevation on Windows for installer .exe files
    const openErr = await shell.openPath(downloadPath);
    if (openErr) {
      console.error('[Updater] shell.openPath error:', openErr);
      emit({ phase: 'error', percent: 100 });
      return { success: false, error: openErr, downloadPath };
    }

    emit({ phase: 'done', percent: 100 });

    // Quit the app so installer can replace files
    setTimeout(() => app.exit(0), 600);

    return { success: true, downloadPath };
  } catch (err: any) {
    console.error('[Updater] Download/install error:', err);
    emit({ phase: 'error', percent: 0 });
    return { success: false, error: err?.message || 'Download failed', downloadPath };
  }
}

export function openReleasePage(): void {
  shell.openExternal(`https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases`);
}

export function openRepoPage(): void {
  shell.openExternal(`https://github.com/${GITHUB_USER}/${GITHUB_REPO}`);
}
