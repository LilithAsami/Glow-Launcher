/**
 * Epic Games OAuth Client Credentials
 */

function encode(id: string, secret: string): string {
  return Buffer.from(`${id}:${secret}`).toString('base64');
}

/** Android / Launcher client — used for token exchange, device auth, and game launching */
export const ANDROID_CLIENT = {
  id: '3f69e56c7649492c8cc29f1af08a8a12',
  secret: 'b51ee9cb12234f50a69efa67ef53812e',
  auth: encode('3f69e56c7649492c8cc29f1af08a8a12', 'b51ee9cb12234f50a69efa67ef53812e'),
};

/** Fortnite client — used for device code authorization flow */
export const FORTNITE_CLIENT = {
  id: '98f7e42c2e3a4f86a74eb43fbb41ed39',
  secret: '0a2449a2-001a-451e-afec-3e812901c4d7',
  auth: encode('98f7e42c2e3a4f86a74eb43fbb41ed39', '0a2449a2-001a-451e-afec-3e812901c4d7'),
};

/** Launcher App Client 2 — used for game launch (generates final exchange code) */
export const LAUNCHER_CLIENT = {
  id: '34a02cf8f4414e29b15921876da36f9a',
  secret: 'daafbccc737745039dffe53d94fc76cf',
  auth: encode('34a02cf8f4414e29b15921876da36f9a', 'daafbccc737745039dffe53d94fc76cf'),
};
