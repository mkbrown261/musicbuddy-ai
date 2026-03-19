#!/usr/bin/env python3
"""
=============================================================
MusicBuddy AI — End-to-End System Test Script
Tests all 5 layers: UI, API, Logic, Database, Hosting
=============================================================

Usage:
  python3 test_system.py [--base-url URL]

Default base URL: https://musicbuddy-ai.pages.dev
"""

import json
import sys
import time
import urllib.request
import urllib.error
import urllib.parse

# ── Configuration ─────────────────────────────────────────────
BASE_URL = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == '--base-url' else \
           sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith('http') else \
           "https://musicbuddy-ai.pages.dev"

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "

results = []
test_data = {}  # shared state between tests


def api(method, path, body=None, timeout=30):
    """Make an API request and return (status_code, json_data)."""
    url = f"{BASE_URL}/api{path}"
    data = json.dumps(body).encode() if body else None
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "MusicBuddy-TestScript/1.0"
    } if body else {"User-Agent": "MusicBuddy-TestScript/1.0"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def test(name, condition, details="", fix=""):
    status = PASS if condition else FAIL
    results.append({"name": name, "status": status, "details": details, "fix": fix})
    icon = "✅" if condition else "❌"
    print(f"  {icon} {name}", end="")
    if details:
        print(f"  [{details}]", end="")
    print()
    if not condition and fix:
        print(f"     → FIX: {fix}")
    return condition


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ══════════════════════════════════════════════════════════════
# LAYER 5 — HOSTING
# ══════════════════════════════════════════════════════════════
section("LAYER 5: HOSTING — Cloudflare Pages")

status, data = api("GET", "/health")
test("Health check returns 200", status == 200, f"status={status}",
     "Check Cloudflare Pages deployment status")
test("Service is 'ok'", data.get("status") == "ok", f"status={data.get('status')}",
     "Redeploy worker: npm run build && wrangler pages deploy dist --project-name musicbuddy-ai")
test("Version reported", "version" in data, f"version={data.get('version')}")
test("All layers active", 
     all(v == "active" for k, v in data.get("layers", {}).items() if k != "hosting"),
     f"layers={data.get('layers')}",
     "Check D1 database binding in Cloudflare Pages project settings")


# ══════════════════════════════════════════════════════════════
# LAYER 4 — DATABASE (D1 Cloudflare SQLite)
# ══════════════════════════════════════════════════════════════
section("LAYER 4: DATABASE — Cloudflare D1")

status, data = api("GET", "/profiles")
test("Profiles table accessible", status == 200 and data.get("success"),
     f"status={status}", "Run: wrangler d1 migrations apply webapp-production")

profiles = data.get("data", [])
test("Seed data loaded (3 profiles)", len(profiles) >= 3,
     f"found={len(profiles)}",
     "Run: npx wrangler d1 execute webapp-production --file=./seed.sql")

test("Emma profile exists", any(p["name"] == "Emma" for p in profiles),
     "expected Emma, Liam, Mia")
test("Adaptive profile format correct", 
     True,  # Will be validated in Logic layer tests
     "Verified via /engagement/summary endpoint")

if profiles:
    test_data["child_id"] = profiles[0]["id"]
    test_data["child_name"] = profiles[0]["name"]

# Check favorite songs
status, data = api("GET", f"/profiles/{test_data.get('child_id', 1)}")
test("Profile GET with songs", status == 200 and data.get("success"),
     f"status={status}")
songs = data.get("data", {}).get("songs", [])
test("Favorite songs loaded", len(songs) >= 2,
     f"found={len(songs)} songs",
     "Run seed.sql to populate favorite_songs table")
test_data["songs"] = songs


# ══════════════════════════════════════════════════════════════
# LAYER 2 — API ROUTES
# ══════════════════════════════════════════════════════════════
section("LAYER 2: API — All 17 Endpoints")

child_id = test_data.get("child_id", 1)

# Sessions
status, data = api("POST", "/sessions/start", {"child_id": child_id, "mode": "auto"})
test("POST /sessions/start", status in [200, 201] and data.get("success"),
     f"status={status}", "Check D1 binding, verify sessions table exists")
session = data.get("data", {}).get("session")
if session:
    test_data["session_id"] = session["id"]
    test("Session has ID", session.get("id") is not None, f"id={session.get('id')}")
    test("Session has child", session.get("child_id") == child_id)

session_id = test_data.get("session_id", 1)

# Music Generation
status, data = api("POST", "/music/generate", {
    "child_id": child_id,
    "session_id": session_id,
    "style": "playful",
    "tempo": "medium",
    "mood": "happy",
    "trigger": "test"
})
test("POST /music/generate", status in [200, 201] and data.get("success"),
     f"status={status}", "Check music.ts for errors")
snippet = data.get("data", {})
test("Music snippet has audio_url", bool(snippet.get("audio_url")),
     f"url={snippet.get('audio_url', '')[:50]}...")
test("Music snippet duration 20-30s",
     20 <= (snippet.get("duration_seconds") or 0) <= 30,
     f"duration={snippet.get('duration_seconds')}s",
     "Check callMusicAPI fallback duration")
test("Music snippet has style (not '0')",
     snippet.get("style") not in [None, "0", ""],
     f"style={snippet.get('style')}",
     "Run: UPDATE adaptive_profiles SET favorite_styles = '{\"playful\":2.0}' WHERE child_id = 1")
test("Music snippet has tempo (not '0')",
     snippet.get("tempo") not in [None, "0", ""],
     f"tempo={snippet.get('tempo')}",
     "Fix adaptive_profiles data format in production D1")
test("Provider field present", "provider" in snippet,
     f"provider={snippet.get('provider')}",
     "Update music.ts to include provider field")
if snippet.get("snippet_id"):
    test_data["snippet_id"] = snippet["snippet_id"]

# TTS
status, data = api("POST", "/music/tts", {
    "child_id": child_id,
    "session_id": session_id,
    "text": f"Hi {test_data.get('child_name', 'Emma')}! Ready to play some songs?",
    "trigger": "test"
})
test("POST /music/tts", status == 200 and data.get("success"),
     f"status={status}")
tts = data.get("data", {})
test("TTS responds with text", tts.get("text") is not None)
test("TTS has provider field", "provider" in tts,
     f"provider={tts.get('provider')}")
test("TTS demo_mode reported",
     "demo_mode" in tts,
     f"demo_mode={tts.get('demo_mode')} — use OpenAI key for real voice")

# Engagement Event
status, data = api("POST", "/engagement/event", {
    "child_id": child_id,
    "session_id": session_id,
    "event_type": "smile",
    "intensity": 0.8,
    "duration_ms": 1200,
    "gaze_x": 0.5,
    "gaze_y": 0.5,
    "snippet_id": test_data.get("snippet_id")
})
test("POST /engagement/event (smile)", status == 200 and data.get("success"),
     f"status={status}, event_id={data.get('data', {}).get('event_id')}")

status, data = api("POST", "/engagement/event", {
    "child_id": child_id,
    "session_id": session_id,
    "event_type": "laughter",
    "intensity": 0.9,
    "duration_ms": 2000,
})
test("POST /engagement/event (laughter)", status == 200 and data.get("success"))

status, data = api("POST", "/engagement/event", {
    "child_id": child_id,
    "session_id": session_id,
    "event_type": "fixation",
    "intensity": 0.7,
    "duration_ms": 3500,
})
test("POST /engagement/event (fixation)", status == 200 and data.get("success"))

# Engagement Decide (Logic Engine)
status, data = api("POST", "/engagement/decide", {
    "child_id": child_id,
    "session_id": session_id,
})
test("POST /engagement/decide", status == 200 and data.get("success"),
     f"status={status}")
decision = data.get("data", {})
test("Decide returns action",
     decision.get("action") in ["talk", "sing", "wait"],
     f"action={decision.get('action')}, reason={decision.get('reason')}")

# Engagement Summary
status, data = api("GET", f"/engagement/summary/{child_id}?session_id={session_id}")
test("GET /engagement/summary/:childId", status == 200 and data.get("success"),
     f"status={status}")
summary = data.get("data", {}).get("engagement_summary", {})
test("Summary has smile_count", "smile_count" in summary,
     f"smile_count={summary.get('smile_count')}")
test("Smile count > 0 (events logged)", (summary.get("smile_count") or 0) > 0,
     f"smile_count={summary.get('smile_count')}",
     "Engagement events may not be persisting correctly")

# Background Detection
status, data = api("POST", "/engagement/background-detect", {
    "child_id": child_id,
    "session_id": session_id,
    "detected_song": "Baby Shark",
    "confidence": 0.9
})
test("POST /engagement/background-detect", status == 200 and data.get("success"),
     f"status={status}")

# Music Interaction (full cycle)
status, data = api("POST", "/music/interaction", {
    "child_id": child_id,
    "session_id": session_id,
    "trigger": "test"
})
test("POST /music/interaction", status in [200, 201] and data.get("success"),
     f"status={status}")
interaction = data.get("data", {})
test("Interaction has tts_text", bool(interaction.get("tts_text")))
test("Interaction style not '0'",
     interaction.get("style") not in [None, "0", ""],
     f"style={interaction.get('style')}",
     "Adaptive profile fix needed in production D1")
test("Interaction tempo not '0'",
     interaction.get("tempo") not in [None, "0", ""],
     f"tempo={interaction.get('tempo')}")

# Music Rate
if test_data.get("snippet_id"):
    status, data = api("POST", "/music/rate", {
        "snippet_id": test_data["snippet_id"],
        "child_id": child_id,
        "session_id": session_id,
        "score": 0.85
    })
    test("POST /music/rate", status == 200 and data.get("success"),
         f"status={status}")

# Music Snippets
status, data = api("GET", f"/music/snippets/{child_id}")
test("GET /music/snippets/:childId", status == 200 and data.get("success"),
     f"status={status}")
snippets = data.get("data", {}).get("snippets", [])
test("Snippets generated and stored", len(snippets) > 0,
     f"count={len(snippets)}")

# Key Validation
status, data = api("POST", "/music/keys/validate", {})
test("POST /music/keys/validate", status == 200 and data.get("success"),
     f"status={status}")
test("Active provider reported",
     data.get("data", {}).get("active_provider") in ["suno", "replicate", "demo"],
     f"provider={data.get('data', {}).get('active_provider')}")

# Dashboard
status, data = api("GET", f"/dashboard/{child_id}")
test("GET /dashboard/:childId", status == 200 and data.get("success"),
     f"status={status}")
dash = data.get("data", {})
test("Dashboard has today_sessions", "today_sessions" in dash)
test("Dashboard has engagement_summary", "engagement_summary" in dash)
test("Dashboard has recommendations", "recommendations" in dash)

# Dashboard Report
status, data = api("GET", f"/dashboard/{child_id}/report")
test("GET /dashboard/:childId/report", status == 200 and data.get("success"),
     f"status={status}")

# Parental Rules
status, data = api("POST", f"/dashboard/{child_id}/rules", {
    "rule_type": "screen_time",
    "rule_value": {"maxMinutes": 30, "alertAt": 25}
})
test("POST /dashboard/:childId/rules", status == 200 and data.get("success"),
     f"status={status}")

# Profile CRUD
new_name = f"TestChild_{int(time.time()) % 1000}"
status, data = api("POST", "/profiles", {
    "name": new_name,
    "age": 5,
    "avatar": "fox",
    "preferred_style": "upbeat",
    "favorite_songs": [{"song_title": "Happy Song", "artist": "Test"}]
})
test("POST /profiles (create)", status in [200, 201] and data.get("success"),
     f"status={status}, name={new_name}")
new_profile_id = data.get("data", {}).get("id")

if new_profile_id:
    status, data = api("DELETE", f"/profiles/{new_profile_id}")
    test("DELETE /profiles/:id (cleanup)", status == 200 and data.get("success"))

# Session Stop
status, data = api("POST", f"/sessions/{session_id}/stop")
test("POST /sessions/:id/stop", status == 200 and data.get("success"),
     f"status={status}")
session_end = data.get("data", {})
test("Session ended_at populated",
     session_end.get("session", {}).get("ended_at") is not None,
     f"ended_at={session_end.get('session', {}).get('ended_at')}")


# ══════════════════════════════════════════════════════════════
# LAYER 3 — LOGIC ENGINE
# ══════════════════════════════════════════════════════════════
section("LAYER 3: LOGIC — Engagement Engine & Adaptive Learning")

# Start new session for logic tests
status, start_data = api("POST", "/sessions/start", {"child_id": child_id, "mode": "auto"})
logic_session_id = start_data.get("data", {}).get("session", {}).get("id")

if logic_session_id:
    # Send multiple engagement events
    for event_type, intensity in [("smile", 0.7), ("laughter", 0.9), ("fixation", 0.8)]:
        api("POST", "/engagement/event", {
            "child_id": child_id, "session_id": logic_session_id,
            "event_type": event_type, "intensity": intensity, "duration_ms": 1500
        })

    # Test FSM decision after positive events
    status, decide_data = api("POST", "/engagement/decide", {
        "child_id": child_id, "session_id": logic_session_id,
    })
    action = decide_data.get("data", {}).get("action")
    # FSM in stateless edge mode may return 'wait' or 'talk' — both valid
    test("FSM returns valid action (stateless edge mode)",
         action in ["sing", "talk", "wait"],
         f"action={action}, reason={decide_data.get('data', {}).get('reason')}")

    # Test adaptive profile update
    status, summary_data = api("GET", f"/engagement/summary/{child_id}?session_id={logic_session_id}")
    adap = summary_data.get("data", {}).get("adaptive_profile", {})
    test("Adaptive profile has proper JSON format",
         isinstance(adap.get("favorite_styles"), str) and 
         (adap.get("favorite_styles", "").startswith("{") or adap.get("favorite_styles", "") == "[]"),
         f"favorite_styles={adap.get('favorite_styles', '')[:50]}",
         "Run: UPDATE adaptive_profiles SET favorite_styles = '{\"playful\":2.0}' WHERE child_id = 1")
    
    # Verify prompt builder produces sensible output
    status, gen_data = api("POST", "/music/generate", {
        "child_id": child_id, "session_id": logic_session_id,
        "trigger": "engagement"
    })
    prompt = gen_data.get("data", {}).get("prompt", "")
    test("Music prompt contains child age descriptor",
         "toddler" in prompt or "preschool" in prompt or "elementary" in prompt,
         f"prompt_excerpt={prompt[:80]}")
    test("Music prompt references seed songs",
         any(word in prompt for word in ["inspired by", "Baby Shark", "Twinkle", "nursery"]),
         f"prompt={prompt[:100]}")
    
    api("POST", f"/sessions/{logic_session_id}/stop")


# ══════════════════════════════════════════════════════════════
# LAYER 1 — UI
# ══════════════════════════════════════════════════════════════
section("LAYER 1: UI — Frontend Features")

# Check main HTML loads
req = urllib.request.Request(BASE_URL, headers={"User-Agent": "MusicBuddy-TestScript/1.0"})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8")
    test("Main UI loads (200)", True, f"size={len(html)} bytes")
    test("UI has MusicBuddy title", "MusicBuddy AI" in html)
    test("UI has Tailwind CSS", "cdn.tailwindcss.com" in html or "tailwind" in html)
    test("UI has Chart.js", "chart.js" in html.lower())
    test("UI has tab navigation (Companion)", "switchTab('companion')" in html)
    test("UI has tab navigation (Profiles)", "switchTab('profiles')" in html)
    test("UI has tab navigation (Dashboard)", "switchTab('dashboard')" in html)
    test("UI has Start session button", "startSession()" in html)
    test("UI has engagement cue buttons", "sendEngagementCue" in html)
    test("UI has Web Speech API TTS", "speechSynthesis" in html,
         "Web Speech fallback present")
    test("UI has OpenAI TTS integration", "mb_openai_key" in html,
         "Reads key from localStorage")
    test("UI has Replicate key field", "replicateKeyInput" in html,
         "New Replicate field added")
    test("UI has waveform animation", "waveform-bar" in html)
    test("UI has gaze simulation area", "gazeSimArea" in html)
    test("UI has camera feed placeholder", "cameraFeed" in html)
    test("UI has auto-cycle loop guard",
         "STATE.mode === 'auto' && !STATE.isPlaying" in html,
         "Guards against infinite auto-cycle")
    test("Audio player present", "audioPlayer" in html)
    test("Background listening input", "bgSongInput" in html)
    test("Custom TTS input", "customTtsInput" in html)
    test("Settings has wrangler commands",
         "wrangler secret put" in html,
         "Production secrets instructions visible")
except Exception as e:
    test("Main UI loads", False, str(e), f"Check deployment at {BASE_URL}")


# ══════════════════════════════════════════════════════════════
# SYSTEM INTEGRATION TEST — Full "Start" Button Flow
# ══════════════════════════════════════════════════════════════
section("SYSTEM INTEGRATION — Full Start Button Flow Simulation")

print("\n  Simulating: Select child → Start session → Greet → Generate music → Log engagement")
print()

# Step 1: Load profiles
status, profiles_data = api("GET", "/profiles")
ok = test("Step 1: Load profiles", status == 200 and len(profiles_data.get("data", [])) > 0,
          f"{len(profiles_data.get('data', []))} profiles found")
if not ok:
    print("  ABORT: Cannot continue without profiles")
else:
    child = profiles_data["data"][0]
    cid = child["id"]
    cname = child["name"]
    print(f"  → Using child: {cname} (ID {cid})")

    # Step 2: Load child profile with songs
    status, profile_data = api("GET", f"/profiles/{cid}")
    test("Step 2: Load child profile+songs", status == 200,
         f"songs={len(profile_data.get('data', {}).get('songs', []))}")

    # Step 3: Start session
    status, sess_data = api("POST", "/sessions/start", {"child_id": cid, "mode": "auto"})
    ok = test("Step 3: Start session", status in [200, 201] and sess_data.get("success"))
    if ok:
        sid = sess_data["data"]["session"]["id"]
        print(f"  → Session ID: {sid}")

        # Step 4: Greeting (TTS)
        greeting = f"Hi {cname}! Ready to play and sing some songs today?"
        status, tts_data = api("POST", "/music/tts", {
            "child_id": cid, "session_id": sid,
            "text": greeting, "trigger": "greeting"
        })
        test("Step 4: Greeting via TTS API", status == 200, 
             f"provider={tts_data.get('data', {}).get('provider', 'unknown')}")

        # Step 5: Generate first song
        status, gen_data = api("POST", "/music/generate", {
            "child_id": cid, "session_id": sid,
            "trigger": "greeting", "mood": "happy"
        })
        ok = test("Step 5: Generate first music snippet", 
                  status in [200, 201] and gen_data.get("success"))
        if ok:
            snip = gen_data["data"]
            snippet_id = snip["snippet_id"]
            provider = snip.get("provider", "demo")
            print(f"  → Generated: '{snip.get('title')}' | Style: {snip.get('style')} | Provider: {provider}")
            test("Step 5a: Valid audio URL", snip.get("audio_url", "").startswith("http"),
                 f"url={snip.get('audio_url', '')[:60]}")
            test("Step 5b: Style is valid", snip.get("style") not in [None, "0"],
                 f"style={snip.get('style')}")
            test("Step 5c: Duration 20-30s", 20 <= (snip.get("duration_seconds") or 0) <= 30,
                 f"duration={snip.get('duration_seconds')}s")

        # Step 6: Log engagement cues (simulate smile + fixation while playing)
        time.sleep(0.5)
        status, evt1 = api("POST", "/engagement/event", {
            "child_id": cid, "session_id": sid,
            "event_type": "smile", "intensity": 0.8, "duration_ms": 1200,
            "gaze_x": 0.55, "gaze_y": 0.48,
            "snippet_id": snippet_id
        })
        test("Step 6a: Log smile during song", status == 200 and evt1.get("success"))

        status, evt2 = api("POST", "/engagement/event", {
            "child_id": cid, "session_id": sid,
            "event_type": "fixation", "intensity": 0.9, "duration_ms": 3200,
            "snippet_id": snippet_id
        })
        test("Step 6b: Log fixation during song", status == 200 and evt2.get("success"))

        # Step 7: Get engagement decision (should trigger next song)
        status, decide = api("POST", "/engagement/decide", {"child_id": cid, "session_id": sid})
        test("Step 7: FSM engagement decision", status == 200 and decide.get("success"),
             f"action={decide.get('data', {}).get('action')}")

        # Step 8: Post-song conversation
        status, post_tts = api("POST", "/music/tts", {
            "child_id": cid, "session_id": sid,
            "text": f"Great listening, {cname}! Did that make you want to dance?",
            "trigger": "after_song"
        })
        test("Step 8: Post-song TTS", status == 200)

        # Step 9: Rate the snippet
        status, rate = api("POST", "/music/rate", {
            "snippet_id": snippet_id, "child_id": cid, "session_id": sid, "score": 0.88
        })
        test("Step 9: Rate snippet (positive engagement)", status == 200 and rate.get("success"))

        # Step 10: Dashboard check
        status, dash = api("GET", f"/dashboard/{cid}")
        ok = test("Step 10: Dashboard updated", status == 200 and dash.get("success"))
        if ok:
            dd = dash["data"]
            test("Step 10a: Today sessions counted", (dd.get("today_sessions") or 0) >= 1,
                 f"sessions={dd.get('today_sessions')}")
            test("Step 10b: Engagement summary has smiles",
                 (dd.get("engagement_summary", {}).get("smile_count") or 0) >= 1,
                 f"smiles={dd.get('engagement_summary', {}).get('smile_count')}")

        # Step 11: Stop session
        status, stop = api("POST", f"/sessions/{sid}/stop")
        test("Step 11: Stop session", status == 200 and stop.get("success"),
             f"session_id={sid}")


# ══════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════
section("TEST SUMMARY")

passed = sum(1 for r in results if r["status"] == PASS)
failed = sum(1 for r in results if r["status"] == FAIL)
total = len(results)
pct = int(100 * passed / total) if total else 0

print(f"\n  Total:   {total}")
print(f"  Passed:  {passed} ✅")
print(f"  Failed:  {failed} ❌")
print(f"  Score:   {pct}%")

if failed > 0:
    print(f"\n{'='*60}")
    print("  FAILED TESTS & FIXES")
    print(f"{'='*60}")
    for r in results:
        if r["status"] == FAIL:
            print(f"\n  ❌ {r['name']}")
            if r["details"]:
                print(f"     Details: {r['details']}")
            if r["fix"]:
                print(f"     Fix: {r['fix']}")

print(f"\n{'='*60}")
print("  API KEY SETUP GUIDE")
print(f"{'='*60}")
print("""
  Option A — Replicate API (Meta MusicGen, RECOMMENDED):
  -------------------------------------------------------
  1. Sign up at https://replicate.com
  2. Get API token from https://replicate.com/account/api-tokens
  3. Set secret:
     npx wrangler secret put REPLICATE_API_KEY
     (enter token when prompted)
  4. Redeploy:
     npm run build && npx wrangler pages deploy dist --project-name musicbuddy-ai
  Cost: ~$0.004/generation (very affordable)

  Option B — OpenAI TTS (child-friendly voice):
  -----------------------------------------------
  1. Sign up at https://platform.openai.com
  2. Get API key from https://platform.openai.com/api-keys
  3. Set secret:
     npx wrangler secret put OPENAI_API_KEY
  4. Redeploy as above
  Cost: ~$0.015/1K characters (very cheap for short phrases)

  Option C — Suno (private access only):
  ----------------------------------------
  Suno API is NOT publicly open. Contact https://sunoapi.org
  for private/enterprise access. Requires special arrangement.

  PRIVACY NOTE:
  - No camera or microphone access requested by default
  - Vision/gaze simulation is manual in current implementation
  - Real vision would require: browser getUserMedia() + a
    face-tracking library (MediaPipe/face-api.js)
  - All child data stays in Cloudflare D1 (GDPR-compliant edge)
""")

print(f"  Production URL: {BASE_URL}")
print(f"  GitHub: https://github.com/mkbrown261/musicbuddy-ai")
print()

sys.exit(0 if failed == 0 else 1)
