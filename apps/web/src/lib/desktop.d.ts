// Provided by the Windows app's preload script (apps/desktop). Absent in a normal browser.
interface Window {
  seedhaPrintDesktop?: {
    pair(code: string, server: string): Promise<string>;
    deviceId(): Promise<string | null>;
  };
}
