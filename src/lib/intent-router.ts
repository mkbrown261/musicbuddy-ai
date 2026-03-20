// ============================================================
// INTENT LAYER ROUTER — src/lib/intent-router.ts
// ============================================================
// ARCHITECTURAL RULE (non-negotiable):
//   ALL new logic communicates ONLY via this router.
//   The Action Layer (routes, audio, UI) receives typed
//   IntentPayload objects and executes them unchanged.
//   No module reaches directly into another module.
//
// Flow:
//   Event → IntentRouter.dispatch(intent, ctx)
//   → Module.handle(ctx)
//   → IntentResult
//   → Action Layer executes result
// ============================================================

// ── Intent Payload Types ──────────────────────────────────────
export type IntentType =
  // Song Library
  | 'PERSIST_SONG'
  | 'PLAY_SONG'
  | 'GET_SONG_LIBRARY'
  | 'REPLAY_SONG'
  // ── TTS Management (modular tiered system) ────────────────
  | 'REQUEST_TTS'             // full orchestrated flow (primary)
  | 'RESOLVE_VOICE_TIER'      // tier check without generation
  | 'GENERATE_TTS'            // direct generation (bypass cache)
  | 'CACHE_AUDIO'             // manually cache an audio entry
  | 'RETRIEVE_CACHED_AUDIO'   // fetch from cache by key
  | 'TRACK_TTS_USAGE'         // log a usage event
  | 'HANDLE_TTS_FALLBACK'     // trigger fallback chain
  | 'GET_TTS_QUOTA'           // current limits / usage
  | 'GET_TTS_CACHE_STATS'     // cache hit rates / storage
  | 'SET_VOICE_PREFS'         // save voice preferences
  | 'GET_VOICE_PREFS'         // load voice preferences
  | 'USE_TTS'                 // legacy alias → REQUEST_TTS
  // Gaze / Camera
  | 'TRACK_GAZE'
  | 'PROCESS_FACE_EVENT'
  | 'GET_GAZE_SUMMARY'
  // Behavior Loop
  | 'APPLY_BEHAVIOR_LOOP'
  | 'ADAPT_BEHAVIOR'
  | 'RECORD_BEHAVIOR_OUTCOME'
  // Free Features
  | 'ACCESS_FREE_FEATURE'
  | 'CHECK_FEATURE_GATE'
  | 'CONSUME_FREE_TRIAL'
  // Billing & Key Provisioning
  | 'PURCHASE_API_KEY'
  | 'VERIFY_PAYMENT'
  | 'INJECT_KEY'
  | 'CHECK_KEY_STATUS'
  | 'PROVISION_KEYS'
  // Engagement (existing, routed through here)
  | 'LOG_ENGAGEMENT'
  | 'GET_ENGAGEMENT_SUMMARY'
  // Session
  | 'START_SESSION'
  | 'END_SESSION'
  // Adaptive Child Engine
  | 'GET_AGE_PROFILE'
  | 'GENERATE_ADAPTIVE_BEHAVIOR'
  | 'GET_AGE_GAMES'
  | 'APPLY_PERSONALITY'
  | 'UPDATE_EMOTION_STATE'
  | 'CHECK_USAGE_LIMIT'
  | 'TRACK_USAGE'
  | 'GET_USAGE_SUMMARY'
  // Engagement & Personality persistence
  | 'SAVE_ENGAGEMENT_STATE'
  | 'LOAD_ENGAGEMENT_STATE'
  | 'SAVE_PERSONALITY_PREF'
  | 'LOAD_PERSONALITY_PREF'
  | 'GET_FULL_SESSION_STATE'
  // ── Monetization & Credits ──────────────────────────────
  | 'GET_USER_CREDITS'
  | 'ADD_CREDITS'
  | 'DEDUCT_CREDITS'
  | 'CHECK_CREDIT_BALANCE'
  | 'CREATE_CHECKOUT_SESSION'
  | 'HANDLE_PAYMENT_SUCCESS'
  | 'GET_SUBSCRIPTION_STATUS'
  // ── Learning System ──────────────────────────────────────
  | 'GET_AVAILABLE_LESSONS'
  | 'START_LESSON'
  | 'SUBMIT_ANSWER'
  | 'EVALUATE_ANSWER'
  | 'GENERATE_LESSON'
  | 'GET_LESSON_PROGRESS'
  // ── Analytics ────────────────────────────────────────────
  | 'TRACK_EVENT'
  | 'GET_ANALYTICS'
  | 'GET_CHILD_ANALYTICS'
  // ── Animation ────────────────────────────────────────────
  | 'TRIGGER_ANIMATION'
  | 'TRIGGER_CONFETTI'
  | 'TRIGGER_CELEBRATION'
  | 'TRIGGER_ENCOURAGEMENT';

export interface IntentPayload<T = Record<string, unknown>> {
  intent: IntentType;
  userId?: string;         // parent/account ID
  childId?: number;        // child profile ID
  sessionId?: number;
  data: T;
  metadata?: {
    source: string;        // which module triggered this
    timestamp: number;
    requestId?: string;
  };
}

export interface IntentResult<T = Record<string, unknown>> {
  success: boolean;
  intent: IntentType;
  data?: T;
  error?: string;
  fallback?: boolean;      // true if a fallback was used
  provider?: string;       // which provider served the result
}

// ── Module Handler Interface ──────────────────────────────────
export interface IntentModule {
  handles: IntentType[];
  handle(payload: IntentPayload, env: any, db?: any): Promise<IntentResult>;
}

// ── Intent Router ─────────────────────────────────────────────
export class IntentRouter {
  private modules: Map<IntentType, IntentModule> = new Map();

  /**
   * Register a module for one or more intent types.
   * Modules are replaceable — re-registering overwrites the handler.
   */
  register(module: IntentModule): void {
    for (const intent of module.handles) {
      this.modules.set(intent, module);
    }
  }

  /**
   * Dispatch an intent to the appropriate module.
   * If no module handles it, returns a typed error result.
   */
  async dispatch<T = Record<string, unknown>>(
    payload: IntentPayload,
    env: any,
    db?: any
  ): Promise<IntentResult<T>> {
    const module = this.modules.get(payload.intent);

    if (!module) {
      console.error(`[IntentRouter] No module registered for intent: ${payload.intent}`);
      return {
        success: false,
        intent: payload.intent,
        error: `No handler registered for intent: ${payload.intent}`,
      };
    }

    try {
      const result = await module.handle(payload, env, db);
      return result as IntentResult<T>;
    } catch (err: any) {
      console.error(`[IntentRouter] Error handling intent ${payload.intent}:`, err);
      return {
        success: false,
        intent: payload.intent,
        error: err?.message ?? 'Unknown error',
      };
    }
  }

  /**
   * Build a standardized intent payload.
   */
  static build<T>(
    intent: IntentType,
    data: T,
    opts: Partial<Omit<IntentPayload, 'intent' | 'data'>> = {}
  ): IntentPayload<T> {
    return {
      intent,
      data,
      userId: opts.userId,
      childId: opts.childId,
      sessionId: opts.sessionId,
      metadata: {
        source: opts.metadata?.source ?? 'system',
        timestamp: Date.now(),
        requestId: opts.metadata?.requestId ?? crypto.randomUUID(),
      },
    };
  }
}

// ── Singleton router instance (shared across all modules) ─────
export const router = new IntentRouter();
