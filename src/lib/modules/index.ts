// ============================================================
// Module Registry — src/lib/modules/index.ts
// ============================================================
// Bootstrap: registers all modules with the IntentRouter singleton.
// Import this once at app startup (src/index.tsx).
// ============================================================

import { router } from '../intent-router';
import { SongLibraryModule } from './song-library';
import { TTSManagerModule } from './tts-manager';
import { GazeTrackerModule } from './gaze-tracker';
import { BehaviorLoopModule } from './behavior-loop';
import { FreeFeaturesModule } from './free-features';
import { BillingKeysModule } from './billing-keys';
import { GroqBehaviorModule } from './groq-behavior';

export function bootstrapModules(): void {
  router.register(new SongLibraryModule());
  router.register(new TTSManagerModule());
  router.register(new GazeTrackerModule());
  router.register(new BehaviorLoopModule());
  router.register(new FreeFeaturesModule());
  router.register(new BillingKeysModule());
  router.register(new GroqBehaviorModule());
  console.log('[ModuleRegistry] All 7 modules registered with IntentRouter (incl. Groq Behavior Engine)');
}

// Re-export router and modules for convenience
export { router } from '../intent-router';
export type { IntentPayload, IntentResult } from '../intent-router';
export { IntentRouter } from '../intent-router';
export { SongLibraryModule } from './song-library';
export { TTSManagerModule } from './tts-manager';
export { GazeTrackerModule } from './gaze-tracker';
export { BehaviorLoopModule } from './behavior-loop';
export { FreeFeaturesModule, FEATURE_REGISTRY } from './free-features';
export { BillingKeysModule, PLANS } from './billing-keys';
export { GroqBehaviorModule } from './groq-behavior';
