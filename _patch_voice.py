#!/usr/bin/env python3
# Patch _renderStep to add voice input support for lessons
import sys

with open('src/index.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# ── OLD block: question step rendering without voice ──────────────────────
OLD = (
    "    } else if (step.type === 'question' && step.options) {\n"
    "      if (nextBtn) nextBtn.classList.add('hidden');\n"
    "      if (opts) {\n"
    "        // data-answer stores the canonical answer string (avoids whitespace textContent bugs)\n"
    "        opts.innerHTML = step.options.map(function(o) {\n"
    '          return \'<button class="answer-btn" data-answer="\'+_escapeAttr(o)+\'">\'+'
    "o+'</button>';\n"
    "        }).join('');\n"
    "        opts.querySelectorAll('.answer-btn').forEach(function(b) {\n"
    "          b.addEventListener('click', function() {\n"
    "            // Use data-answer (canonical) not textContent (may have whitespace)\n"
    "            LESSONS.answer(b.getAttribute('data-answer'));\n"
    "          });\n"
    "        });\n"
    "      }\n"
    "    }\n"
    "  }"
)

# ── NEW block: question step rendering WITH voice ─────────────────────────
NEW = (
    "    } else if (step.type === 'question' && step.options) {\n"
    "      if (nextBtn) nextBtn.classList.add('hidden');\n"
    "      if (opts) {\n"
    "        // data-answer stores the canonical answer string (avoids whitespace textContent bugs)\n"
    "        opts.innerHTML = step.options.map(function(o) {\n"
    '          return \'<button class="answer-btn" data-answer="\'+_escapeAttr(o)+\'">\'+'
    "o+'</button>';\n"
    "        }).join('');\n"
    "        opts.querySelectorAll('.answer-btn').forEach(function(b) {\n"
    "          b.addEventListener('click', function() {\n"
    "            // Use data-answer (canonical) not textContent (may have whitespace)\n"
    "            LESSONS.answer(b.getAttribute('data-answer'));\n"
    "          });\n"
    "        });\n"
    "      }\n"
    "      // \u2500\u2500 Intent: Voice Input for lessons (same rule as free games) \u2500\u2500\n"
    "      var voiceRow = document.getElementById('lessonVoiceRow');\n"
    "      if (voiceRow) {\n"
    "        if (VOICE_INPUT.isSupported()) {\n"
    "          voiceRow.classList.remove('hidden');\n"
    "          // Auto-start after TTS settles (800 ms, mirrors Call-and-Response)\n"
    "          setTimeout(function() { _listenForAnswer(step.options); }, 800);\n"
    "        } else {\n"
    "          voiceRow.classList.add('hidden');\n"
    "        }\n"
    "      }\n"
    "    } else {\n"
    "      // hide voice row on intro/reward steps\n"
    "      var voiceRowHide = document.getElementById('lessonVoiceRow');\n"
    "      if (voiceRowHide) voiceRowHide.classList.add('hidden');\n"
    "    }\n"
    "  }\n"
    "\n"
    "  // \u2500\u2500 Intent: Voice Input for Lessons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "  // Mirrors carListenForResponse: listens for any of the answer options,\n"
    "  // fuzzy-matches, then routes to LESSONS.answer() via the Intent Layer.\n"
    "  function _listenForAnswer(options) {\n"
    "    if (!VOICE_INPUT.isSupported()) return;\n"
    "    if (state._answering) return;\n"
    "    if (!state.lesson)    return;\n"
    "\n"
    "    var micBtn    = document.getElementById('lessonMicBtn');\n"
    "    var micStatus = document.getElementById('lessonMicStatus');\n"
    "\n"
    "    if (micBtn) {\n"
    "      micBtn.disabled = true;\n"
    "      micBtn.innerHTML = '<span class=\"text-xl\">\U0001f534</span><span>Listening\u2026</span>';\n"
    "    }\n"
    "    if (micStatus) micStatus.textContent = '\U0001f3a4 Listening \u2014 say your answer!';\n"
    "\n"
    "    // Combine all option strings so listenFor fuzzy-matches any of them\n"
    "    var expectedPhrase = (options || []).join(' ');\n"
    "\n"
    "    VOICE_INPUT.listenFor(\n"
    "      expectedPhrase,\n"
    "      7000,\n"
    "      // onSuccess \u2500\u2500\n"
    "      function(heard) {\n"
    "        if (micBtn) {\n"
    "          micBtn.disabled = false;\n"
    "          micBtn.innerHTML = '<span class=\"text-xl\">\U0001f3a4</span><span>Say your answer!</span>';\n"
    "        }\n"
    "        if (micStatus) micStatus.textContent = '\u2705 I heard: ' + heard;\n"
    "\n"
    "        // Match heard text to the closest answer option\n"
    "        var matched = null;\n"
    "        var lHeard  = heard.toLowerCase();\n"
    "        // 1) exact\n"
    "        (options || []).forEach(function(opt) {\n"
    "          if (opt.toLowerCase() === lHeard) matched = opt;\n"
    "        });\n"
    "        // 2) substring\n"
    "        if (!matched) {\n"
    "          (options || []).forEach(function(opt) {\n"
    "            var lOpt = opt.toLowerCase();\n"
    "            if (!matched && (lHeard.includes(lOpt) || lOpt.includes(lHeard))) matched = opt;\n"
    "          });\n"
    "        }\n"
    "        // 3) word-level fuzzy\n"
    "        if (!matched) {\n"
    "          var bestScore = 0;\n"
    "          (options || []).forEach(function(opt) {\n"
    "            var words = opt.toLowerCase().split(/\\s+/);\n"
    "            var score = words.filter(function(w) {\n"
    "              return w.length > 1 && lHeard.includes(w);\n"
    "            }).length;\n"
    "            if (score > bestScore) { bestScore = score; matched = opt; }\n"
    "          });\n"
    "        }\n"
    "\n"
    "        if (matched) {\n"
    "          // Route through Intent Layer \u2014 same as a tap\n"
    "          LESSONS.answer(matched);\n"
    "        } else {\n"
    "          if (micStatus) micStatus.textContent = '\U0001f914 Try tapping your answer below!';\n"
    "          if (micBtn) {\n"
    "            micBtn.disabled = false;\n"
    "            micBtn.innerHTML = '<span class=\"text-xl\">\U0001f3a4</span><span>Try again!</span>';\n"
    "          }\n"
    "        }\n"
    "      },\n"
    "      // onFail \u2500\u2500\n"
    "      function(reason) {\n"
    "        if (micBtn) {\n"
    "          micBtn.disabled = false;\n"
    "          micBtn.innerHTML = '<span class=\"text-xl\">\U0001f3a4</span><span>Try again!</span>';\n"
    "        }\n"
    "        if (micStatus) micStatus.textContent = reason === 'timeout'\n"
    "          ? '\u23f1\ufe0f Tap your answer below, or tap \U0001f3a4 to try again!'\n"
    "          : '\U0001f504 Mic issue \u2014 tap your answer or try again!';\n"
    "      }\n"
    "    );\n"
    "  }"
)

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    with open('src/index.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("OK: _renderStep patched with voice input")
else:
    # Try to locate to debug
    idx = content.find("} else if (step.type === 'question' && step.options)")
    if idx >= 0:
        print("FOUND question block at char", idx)
        print(repr(content[idx:idx+600]))
    else:
        print("ERROR: question block not found at all")
    sys.exit(1)
