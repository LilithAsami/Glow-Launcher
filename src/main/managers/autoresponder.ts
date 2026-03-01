/**
 * AutoResponder — MITM Proxy
 *
 * Runs a local HTTP/HTTPS proxy server (like Fiddler):
 *   1. Captures ALL traffic from the system (Fortnite, browser, etc.)
 *   2. Intercepts matching requests and serves custom responses
 *   3. Sets the Windows system proxy automatically
 *
 * HTTPS interception uses a self-signed root CA certificate.
 * The user must install it once via the "Install Certificate" button.
 */

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as forge from 'node-forge';
import { app, BrowserWindow, dialog, session } from 'electron';
import { execSync } from 'child_process';
import type { Storage } from '../storage';

// ─── Types ────────────────────────────────────────────────────

export interface AutoResponderRule {
  id: string;
  enabled: boolean;
  match: 'contains' | 'exact' | 'regex';
  pattern: string;
  statusCode: number;
  contentType: string;
  body: string;
  responseFile?: string;
  label: string;
  createdAt: number;
}

export interface TrafficEntry {
  id: number;
  url: string;
  method: string;
  host: string;
  protocol: string;
  resourceType: string;
  statusCode: number;
  contentType: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  intercepted: boolean;
  interceptedBy?: string;
  responseBody?: string;
  timestamp: number;
  completed: boolean;
  error?: string;
}

// ─── State ────────────────────────────────────────────────────

let globalEnabled = false;
let rules: AutoResponderRule[] = [];
let _storage: Storage | null = null;

let proxyServer: http.Server | null = null;
let internalHttpServer: http.Server | null = null;
let proxyPort = 0;
let proxyRunning = false;
let interceptedCount = 0;

let traffic: TrafficEntry[] = [];
let trafficSeq = 0;

let caKey: forge.pki.rsa.PrivateKey | null = null;
let caCert: forge.pki.Certificate | null = null;
let caCertPem = '';

const STORAGE_KEY = 'autoresponder';
const MAX_TRAFFIC = 500;
const MAX_BODY_CAPTURE = 50 * 1024;
const DEFAULT_PORT = 8899;
const hostCertCache = new Map<string, { key: string; cert: string }>();
const socketHostMap = new WeakMap<net.Socket, { host: string; port: number }>();

// ─── Helpers ──────────────────────────────────────────────────

function generateId(): string {
  return `ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function matchesRule(url: string, rule: AutoResponderRule): boolean {
  try {
    switch (rule.match) {
      case 'contains': return url.toLowerCase().includes(rule.pattern.toLowerCase());
      case 'exact':    return url === rule.pattern;
      case 'regex':    return new RegExp(rule.pattern, 'i').test(url);
      default:         return false;
    }
  } catch { return false; }
}

function extractHost(rawUrl: string): string {
  try { return new URL(rawUrl).host; } catch { return ''; }
}

function shouldCaptureBody(ct: string): boolean {
  if (!ct) return false;
  return /text|json|xml|html|javascript|urlencoded/i.test(ct);
}

function flatHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = Array.isArray(v) ? v.join(', ') : (v || '');
  }
  return out;
}

function emitWin(channel: string, ...args: any[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, ...args); } catch { /* */ }
  }
}

// ─── CA Certificate Management ────────────────────────────────

function getCaDir(): string {
  return path.join(app.getPath('userData'), 'proxy-ca');
}

function ensureCA(): void {
  const dir = getCaDir();
  const keyPath = path.join(dir, 'ca-key.pem');
  const certPath = path.join(dir, 'ca-cert.pem');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Load existing CA
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      caKey = forge.pki.privateKeyFromPem(fs.readFileSync(keyPath, 'utf8'));
      caCert = forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf8'));
      caCertPem = fs.readFileSync(certPath, 'utf8');
      return;
    } catch { /* regenerate */ }
  }

  // Generate new CA (native crypto for fast key-gen, forge for cert structure)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const forgePublicKey = forge.pki.publicKeyFromPem(publicKey);
  const forgePrivateKey = forge.pki.privateKeyFromPem(privateKey);

  const cert = forge.pki.createCertificate();
  cert.publicKey = forgePublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);

  const attrs = [
    { name: 'commonName', value: 'Glow Launcher Proxy CA' },
    { name: 'organizationName', value: 'GLOW' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true },
  ]);
  cert.sign(forgePrivateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);

  fs.writeFileSync(keyPath, privateKey);
  fs.writeFileSync(certPath, certPem);
  fs.writeFileSync(path.join(dir, 'glow-proxy-ca.crt'), certPem);

  caKey = forgePrivateKey;
  caCert = cert;
  caCertPem = certPem;
}

// ─── Host Certificate Generation ──────────────────────────────

function getHostCert(hostname: string): { key: string; cert: string } {
  const cached = hostCertCache.get(hostname);
  if (cached) return cached;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = Date.now().toString(16) + Math.random().toString(16).slice(2, 6);
  cert.validity.notBefore = new Date();
  cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  cert.setSubject([{ name: 'commonName', value: hostname }]);
  cert.setIssuer(caCert!.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(caKey!, forge.md.sha256.create());

  const result = { key: privateKey, cert: forge.pki.certificateToPem(cert) };
  hostCertCache.set(hostname, result);
  return result;
}

// ─── Traffic Management ───────────────────────────────────────

function addEntry(url: string, method: string): TrafficEntry {
  const entry: TrafficEntry = {
    id: ++trafficSeq,
    url, method,
    host: extractHost(url),
    protocol: url.startsWith('https') ? 'HTTPS' : 'HTTP',
    resourceType: '',
    statusCode: 0, contentType: '',
    requestHeaders: {}, responseHeaders: {},
    intercepted: false,
    timestamp: Date.now(),
    completed: false,
  };
  traffic.push(entry);
  if (traffic.length > MAX_TRAFFIC) traffic.shift();
  return entry;
}

function emitTraffic(type: string, entry: TrafficEntry): void {
  emitWin('autoresponder:traffic', { type, entry: { ...entry } });
}

// ─── Serve Rule Response ──────────────────────────────────────

function serveRule(rule: AutoResponderRule, res: http.ServerResponse, entry: TrafficEntry): void {
  interceptedCount++;
  entry.intercepted = true;
  entry.interceptedBy = rule.label || rule.pattern;
  entry.statusCode = rule.statusCode;
  entry.contentType = rule.contentType;
  entry.completed = true;

  let body: string | Buffer = rule.body || '';

  if (rule.responseFile) {
    try {
      const raw = fs.readFileSync(rule.responseFile);
      // For text-like content types, read as UTF-8 string (strip BOM)
      if (/text|json|xml|html|javascript|urlencoded/i.test(rule.contentType)) {
        let str = raw.toString('utf8');
        if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1); // strip UTF-8 BOM
        body = str;
      } else {
        body = raw;
      }
      const bodyStr = typeof body === 'string' ? body : body.toString('utf8');
      entry.responseBody = bodyStr.length > MAX_BODY_CAPTURE
        ? bodyStr.slice(0, MAX_BODY_CAPTURE) + '\n[truncated]'
        : bodyStr;
    } catch (err: any) {
      body = `File read error: ${err.message}`;
      entry.responseBody = body as string;
      entry.error = err.message;
    }
  } else {
    entry.responseBody = typeof body === 'string' ? body.slice(0, MAX_BODY_CAPTURE) : '';
  }

  emitTraffic('update', entry);

  const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  try {
    res.writeHead(rule.statusCode, {
      'Content-Type': rule.contentType,
      'Content-Length': bodyBuf.length,
      'Access-Control-Allow-Origin': '*',
      'Connection': 'close',
    });
    res.end(bodyBuf);
  } catch { /* socket closed */ }
}

// ─── Request Forwarding ───────────────────────────────────────

function forwardHttp(clientReq: http.IncomingMessage, clientRes: http.ServerResponse, entry: TrafficEntry): void {
  let targetUrl: URL;
  try { targetUrl = new URL(clientReq.url!); }
  catch {
    entry.error = 'Invalid URL'; entry.completed = true;
    emitTraffic('update', entry);
    clientRes.writeHead(400); clientRes.end('Bad Request');
    return;
  }

  const options: http.RequestOptions = {
    hostname: targetUrl.hostname,
    port: parseInt(targetUrl.port) || 80,
    path: targetUrl.pathname + targetUrl.search,
    method: clientReq.method,
    headers: { ...clientReq.headers },
  };
  delete (options.headers as any)['proxy-connection'];

  const proxyReq = http.request(options, (proxyRes) => captureAndForward(proxyRes, clientRes, entry));
  proxyReq.on('error', (err) => fwdError(err, clientRes, entry));
  clientReq.on('error', () => { try { proxyReq.destroy(); } catch {} });
  clientReq.pipe(proxyReq);
}

function forwardHttps(host: string, port: number, clientReq: http.IncomingMessage, clientRes: http.ServerResponse, entry: TrafficEntry): void {
  const options: https.RequestOptions = {
    hostname: host, port,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers },
    rejectUnauthorized: false,
  };
  delete (options.headers as any)['proxy-connection'];

  const proxyReq = https.request(options, (proxyRes) => captureAndForward(proxyRes, clientRes, entry));
  proxyReq.on('error', (err) => fwdError(err, clientRes, entry));
  clientReq.on('error', () => { try { proxyReq.destroy(); } catch {} });
  clientReq.pipe(proxyReq);
}

function captureAndForward(proxyRes: http.IncomingMessage, clientRes: http.ServerResponse, entry: TrafficEntry): void {
  entry.statusCode = proxyRes.statusCode || 0;
  entry.responseHeaders = flatHeaders(proxyRes.headers);
  entry.contentType = String(proxyRes.headers['content-type'] || '');

  const capture = shouldCaptureBody(entry.contentType);
  const chunks: Buffer[] = [];
  let sz = 0;

  if (capture) {
    proxyRes.on('data', (chunk: Buffer) => { if (sz < MAX_BODY_CAPTURE) { chunks.push(chunk); sz += chunk.length; } });
  }
  proxyRes.on('end', () => {
    if (capture && chunks.length) entry.responseBody = Buffer.concat(chunks).toString('utf8').slice(0, MAX_BODY_CAPTURE);
    entry.completed = true;
    emitTraffic('update', entry);
  });

  try {
    // Silently absorb stream errors — e.g. client disconnects mid-pipe
    if (!clientRes.listenerCount('error')) clientRes.on('error', () => {});
    if (!proxyRes.listenerCount('error')) proxyRes.on('error', () => {});
    clientRes.writeHead(proxyRes.statusCode!, proxyRes.headers); proxyRes.pipe(clientRes);
  }
  catch { /* socket closed */ }
}

function fwdError(err: Error, clientRes: http.ServerResponse, entry: TrafficEntry): void {
  entry.error = err.message; entry.completed = true;
  emitTraffic('update', entry);
  // Silently absorb any future error events on this response to prevent
  // uncaught 'error' events that Node emits asynchronously after a write
  if (!clientRes.listenerCount('error')) clientRes.on('error', () => {});
  if (clientRes.writableEnded) return; // already closed — nothing to do
  try {
    if (!clientRes.headersSent) clientRes.writeHead(502);
    clientRes.end(`Proxy Error: ${err.message}`);
  } catch { /* stream closed concurrently */ }
}

// ─── Proxy Server ─────────────────────────────────────────────

function createProxy(): void {
  // Internal HTTP server for decrypted HTTPS traffic (never listens on a port)
  internalHttpServer = http.createServer((clientReq, clientRes) => {
    const hostInfo = socketHostMap.get(clientReq.socket);
    const host = hostInfo?.host || clientReq.headers.host || '';
    const port = hostInfo?.port || 443;
    const fullUrl = `https://${host}${clientReq.url}`;

    const entry = addEntry(fullUrl, clientReq.method || 'GET');
    entry.host = host;
    entry.protocol = 'HTTPS';
    entry.requestHeaders = flatHeaders(clientReq.headers);
    emitTraffic('new', entry);

    if (globalEnabled) {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (matchesRule(fullUrl, rule)) { serveRule(rule, clientRes, entry); return; }
      }
    }
    forwardHttps(host, port, clientReq, clientRes, entry);
  });

  // Handle WebSocket upgrade on decrypted HTTPS connections
  internalHttpServer.on('upgrade', (clientReq: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    const hostInfo = socketHostMap.get(clientReq.socket);
    const host = hostInfo?.host || (clientReq.headers.host || '').split(':')[0];
    const port = hostInfo?.port || 443;
    const fullUrl = `wss://${host}${clientReq.url || '/'}`;

    const entry = addEntry(fullUrl, clientReq.method || 'GET');
    entry.protocol = 'WSS';
    entry.resourceType = 'websocket';
    entry.host = host;
    entry.requestHeaders = flatHeaders(clientReq.headers);
    emitTraffic('new', entry);

    // Establish TLS connection to the real server
    const serverSocket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      // Reconstruct the HTTP upgrade request to send to the real server
      let reqStr = `${clientReq.method || 'GET'} ${clientReq.url || '/'} HTTP/${clientReq.httpVersion}\r\n`;
      for (const [key, val] of Object.entries(clientReq.headers)) {
        if (Array.isArray(val)) { val.forEach(v => { reqStr += `${key}: ${v}\r\n`; }); }
        else if (val !== undefined) { reqStr += `${key}: ${val}\r\n`; }
      }
      reqStr += '\r\n';

      serverSocket.write(reqStr);
      if (head && head.length > 0) serverSocket.write(head);

      // Pipe bidirectionally — full duplex WebSocket passthrough
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);

      entry.statusCode = 101;
      entry.completed = true;
      emitTraffic('update', entry);
    });

    serverSocket.on('error', (err) => {
      entry.error = err.message; entry.completed = true;
      emitTraffic('update', entry);
      try { clientSocket.destroy(); } catch {}
    });
    clientSocket.on('error', () => { try { serverSocket.destroy(); } catch {}; });
    clientSocket.on('close', () => { try { serverSocket.destroy(); } catch {}; });
    serverSocket.on('close', () => { try { clientSocket.destroy(); } catch {}; });
  });

  // Main proxy server
  proxyServer = http.createServer((clientReq, clientRes) => {
    const reqUrl = clientReq.url || '';
    const entry = addEntry(reqUrl, clientReq.method || 'GET');
    entry.protocol = 'HTTP';
    entry.requestHeaders = flatHeaders(clientReq.headers);
    emitTraffic('new', entry);

    if (globalEnabled) {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (matchesRule(reqUrl, rule)) { serveRule(rule, clientRes, entry); return; }
      }
    }
    forwardHttp(clientReq, clientRes, entry);
  });

  // Handle WebSocket upgrade on plain HTTP connections
  proxyServer.on('upgrade', (clientReq: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    const reqUrl = clientReq.url || '';
    let targetHost: string;
    let targetPort: number;
    let targetPath: string;

    try {
      const u = new URL(reqUrl);
      targetHost = u.hostname;
      targetPort = parseInt(u.port) || 80;
      targetPath = u.pathname + u.search;
    } catch {
      targetHost = (clientReq.headers.host || '').split(':')[0];
      targetPort = 80;
      targetPath = reqUrl;
    }

    const fullUrl = `ws://${targetHost}${targetPath}`;
    const entry = addEntry(fullUrl, clientReq.method || 'GET');
    entry.protocol = 'WS';
    entry.resourceType = 'websocket';
    entry.host = targetHost;
    entry.requestHeaders = flatHeaders(clientReq.headers);
    emitTraffic('new', entry);

    const serverSocket = net.connect(targetPort, targetHost, () => {
      let reqStr = `${clientReq.method || 'GET'} ${targetPath} HTTP/${clientReq.httpVersion}\r\n`;
      for (const [key, val] of Object.entries(clientReq.headers)) {
        if (Array.isArray(val)) { val.forEach(v => { reqStr += `${key}: ${v}\r\n`; }); }
        else if (val !== undefined) { reqStr += `${key}: ${val}\r\n`; }
      }
      reqStr += '\r\n';

      serverSocket.write(reqStr);
      if (head && head.length > 0) serverSocket.write(head);

      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);

      entry.statusCode = 101;
      entry.completed = true;
      emitTraffic('update', entry);
    });

    serverSocket.on('error', (err) => {
      entry.error = err.message; entry.completed = true;
      emitTraffic('update', entry);
      try { clientSocket.destroy(); } catch {}
    });
    clientSocket.on('error', () => { try { serverSocket.destroy(); } catch {}; });
    clientSocket.on('close', () => { try { serverSocket.destroy(); } catch {}; });
    serverSocket.on('close', () => { try { clientSocket.destroy(); } catch {}; });
  });

  // HTTPS CONNECT handler
  proxyServer.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    const [host, portStr] = (req.url || '').split(':');
    const port = parseInt(portStr) || 443;

    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length > 0) clientSocket.unshift(head);

    try {
      const { key, cert } = getHostCert(host);
      const tlsSocket = new tls.TLSSocket(clientSocket, {
        isServer: true,
        secureContext: tls.createSecureContext({ key, cert }),
      });

      tlsSocket.on('error', () => { try { clientSocket.destroy(); } catch {} });
      clientSocket.on('error', () => { try { tlsSocket.destroy(); } catch {} });

      socketHostMap.set(tlsSocket, { host, port });
      internalHttpServer!.emit('connection', tlsSocket);
    } catch {
      // Fallback: plain tunnel
      const srv = net.connect(port, host, () => {
        if (head && head.length > 0) srv.write(head);
        clientSocket.pipe(srv); srv.pipe(clientSocket);
      });
      srv.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => srv.destroy());
    }
  });

  proxyServer.on('error', () => { /* swallow */ });
}

// ─── Start / Stop ─────────────────────────────────────────────

async function doStartProxy(): Promise<number> {
  ensureCA();
  createProxy();

  return new Promise((resolve, reject) => {
    const tryPort = (port: number, attempt: number) => {
      if (attempt > 10) { reject(new Error('No available port')); return; }

      proxyServer!.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') tryPort(port + 1, attempt + 1);
        else reject(err);
      });

      proxyServer!.listen(port, '127.0.0.1', () => {
        proxyPort = port;
        proxyRunning = true;
        setSystemProxy(port);
        session.defaultSession.setProxy({ mode: 'direct' }).catch(() => {});
        resolve(port);
      });
    };
    tryPort(DEFAULT_PORT, 0);
  });
}

function doStopProxy(): void {
  clearSystemProxy();
  try { proxyServer?.close(); } catch {}
  try { internalHttpServer?.close(); } catch {}
  proxyServer = null;
  internalHttpServer = null;
  proxyRunning = false;
  proxyPort = 0;
}

// ─── System Proxy (Windows registry) ──────────────────────────

function setSystemProxy(port: number): void {
  try {
    const rp = '"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"';
    execSync(`reg add ${rp} /v ProxyEnable /t REG_DWORD /d 1 /f`, { windowsHide: true, stdio: 'ignore' });
    execSync(`reg add ${rp} /v ProxyServer /t REG_SZ /d "127.0.0.1:${port}" /f`, { windowsHide: true, stdio: 'ignore' });
    execSync(`reg add ${rp} /v ProxyOverride /t REG_SZ /d "<local>;localhost;127.0.0.1" /f`, { windowsHide: true, stdio: 'ignore' });
    try { execSync('netsh winhttp import proxy source=ie', { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch {}
  } catch (e: any) { console.error('[AutoResponder] set proxy:', e.message); }
}

function clearSystemProxy(): void {
  try {
    const rp = '"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"';
    execSync(`reg add ${rp} /v ProxyEnable /t REG_DWORD /d 0 /f`, { windowsHide: true, stdio: 'ignore' });
    try { execSync('netsh winhttp reset proxy', { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch {}
  } catch (e: any) { console.error('[AutoResponder] clear proxy:', e.message); }
}

// ─── Public API (called from IPC) ─────────────────────────────

export async function initialize(storage: Storage): Promise<void> {
  _storage = storage;

  // ── Safety net: always clear any leftover proxy from a previous crash ──
  // If the launcher crashed last session with the proxy active, it would
  // have left the registry in a broken state. Clear it unconditionally at startup.
  clearSystemProxy();

  const data = await storage.get<{ enabled: boolean; rules: AutoResponderRule[] }>(STORAGE_KEY);
  if (data) {
    globalEnabled = data.enabled ?? false;
    rules = data.rules ?? [];
  }

  if (globalEnabled) {
    try { await doStartProxy(); }
    catch { globalEnabled = false; }
  }

  // ── Cleanup on every possible exit path ───────────────────────────────
  const cleanup = () => {
    try { clearSystemProxy(); } catch {}
    try { if (proxyRunning) doStopProxy(); } catch {}
  };

  // Normal Electron quit
  app.on('before-quit', cleanup);
  app.on('will-quit', cleanup);

  // Node process exit (sync — execSync works here)
  process.on('exit', cleanup);

  // Terminal Ctrl+C / task manager / kill signal
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  // Uncaught exception — log it and clean up before dying
  process.on('uncaughtException', (err) => {
    const code = (err as any).code as string | undefined;
    // These are known-harmless proxy stream races; swallow them silently
    if (code === 'ERR_STREAM_WRITE_AFTER_END' ||
        code === 'ERR_HTTP_HEADERS_SENT' ||
        code === 'ECONNRESET' ||
        code === 'EPIPE') {
      return;
    }
    console.error('[AutoResponder] uncaughtException — cleaning proxy before exit:', err);
    try { clearSystemProxy(); } catch {}
    // Re-throw so Electron/Node can handle crash reporting normally
    throw err;
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[AutoResponder] unhandledRejection:', reason);
  });
}

async function persist(): Promise<void> {
  if (_storage) await _storage.set(STORAGE_KEY, { enabled: globalEnabled, rules });
}

export async function getFullStatus(_s: Storage): Promise<{
  enabled: boolean; rules: AutoResponderRule[]; interceptedCount: number;
}> {
  return { enabled: globalEnabled, rules: [...rules], interceptedCount };
}

export async function setEnabled(storage: Storage, enabled: boolean): Promise<{
  enabled: boolean; port: number; error?: string;
}> {
  if (enabled && !proxyRunning) {
    try {
      const port = await doStartProxy();
      globalEnabled = true; await persist();
      return { enabled: true, port };
    } catch (err: any) {
      return { enabled: false, port: 0, error: err.message };
    }
  }
  if (!enabled && proxyRunning) {
    doStopProxy();
    globalEnabled = false; await persist();
    return { enabled: false, port: 0 };
  }
  globalEnabled = enabled; await persist();
  return { enabled: globalEnabled, port: proxyPort };
}

export async function addRule(
  storage: Storage,
  rule: Omit<AutoResponderRule, 'id' | 'createdAt'>,
): Promise<AutoResponderRule> {
  const nr: AutoResponderRule = { ...rule, id: generateId(), createdAt: Date.now() };
  rules.push(nr); await persist(); return nr;
}

export async function updateRule(
  storage: Storage, ruleId: string,
  partial: Partial<Omit<AutoResponderRule, 'id' | 'createdAt'>>,
): Promise<AutoResponderRule | null> {
  const i = rules.findIndex((r) => r.id === ruleId);
  if (i < 0) return null;
  rules[i] = { ...rules[i], ...partial };
  await persist(); return rules[i];
}

export async function deleteRule(storage: Storage, ruleId: string): Promise<boolean> {
  const n = rules.length;
  rules = rules.filter((r) => r.id !== ruleId);
  if (rules.length !== n) { await persist(); return true; }
  return false;
}

export async function toggleRule(storage: Storage, ruleId: string, enabled: boolean): Promise<boolean> {
  const r = rules.find((x) => x.id === ruleId);
  if (!r) return false;
  r.enabled = enabled; await persist(); return true;
}

export async function testPattern(
  _s: Storage, match: 'contains' | 'exact' | 'regex', pattern: string, testUrl: string,
): Promise<{ matches: boolean; error?: string }> {
  try {
    const fake = { id: '', enabled: true, match, pattern, statusCode: 200, contentType: '', body: '', label: '', createdAt: 0 } as AutoResponderRule;
    return { matches: matchesRule(testUrl, fake) };
  } catch (e: any) { return { matches: false, error: e.message }; }
}

// ─── Traffic API ──────────────────────────────────────────────

export function getTraffic(): TrafficEntry[] { return [...traffic]; }
export function getTrafficEntry(entryId: number): TrafficEntry | null { return traffic.find((t) => t.id === entryId) || null; }
export function clearTraffic(): void { traffic = []; trafficSeq = 0; interceptedCount = 0; }

// ─── File Browse ──────────────────────────────────────────────

export async function browseFile(pw?: BrowserWindow | null): Promise<string | null> {
  const win = pw || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const r = await dialog.showOpenDialog(win!, {
    title: 'Select Response File',
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
}

// ─── Certificate Install ─────────────────────────────────────

export async function installCert(): Promise<{ success: boolean; message: string }> {
  ensureCA();
  const certPath = path.join(getCaDir(), 'glow-proxy-ca.crt');
  if (!fs.existsSync(certPath)) return { success: false, message: 'CA certificate not found.' };

  try {
    execSync(
      `powershell -Command "Start-Process certutil -ArgumentList '-addstore','Root','${certPath.replace(/'/g, "''")}' -Verb RunAs -Wait"`,
      { windowsHide: true, timeout: 60000, stdio: 'ignore' },
    );
    return { success: true, message: 'Certificate installed. HTTPS interception is now active.' };
  } catch {
    try {
      execSync(`certutil -addstore -user Root "${certPath}"`, { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      return { success: true, message: 'Certificate installed (user store).' };
    } catch {
      return { success: false, message: 'Failed. Try running launcher as administrator.' };
    }
  }
}

// ─── Proxy Status ─────────────────────────────────────────────

export function getProxyStatus(): { running: boolean; port: number; certPath: string } {
  return { running: proxyRunning, port: proxyPort, certPath: path.join(getCaDir(), 'glow-proxy-ca.crt') };
}
