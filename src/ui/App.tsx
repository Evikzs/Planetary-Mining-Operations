import type { DebugFlags } from '../worker/protocol';
import { NoWebGL } from './screens/NoWebGL';
import { Shell } from './shell/Shell';

export const APP_TITLE = 'Planetary Mining Operations';

export function App({ flags, webgl }: { flags: DebugFlags; webgl: boolean }) {
  return webgl ? <Shell flags={flags} /> : <NoWebGL title={APP_TITLE} />;
}
