/** Present only in the desktop app, from its preload. */
interface PmoSaves {
  list(): Promise<string[]>;
  read(slot: string): Promise<string | null>;
  write(slot: string, text: string): Promise<void>;
  remove(slot: string): Promise<void>;
}

interface PmoApp {
  onCloseRequest(cb: () => void): void;
  closeReady(): void;
}

interface Window {
  pmoSaves?: PmoSaves;
  pmoApp?: PmoApp;
}
