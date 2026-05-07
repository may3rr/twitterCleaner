const TC_RULES = {
  score(text) {
    let score = 0;
    const lower = text.toLowerCase();

    // Keyword hits: +0.18 each, cap 0.6
    const keywordHits = TC_CONFIG.SPAM_KEYWORDS.filter(k => lower.includes(k.toLowerCase())).length;
    score += Math.min(keywordHits * 0.18, 0.6);

    // URL count: +0.15 each, cap 0.3
    const urlCount = (text.match(/https?:\/\/|t\.co\//g) || []).length;
    score += Math.min(urlCount * 0.15, 0.3);

    // Excessive mentions (>=4): +0.15
    const mentionCount = (text.match(/@\w+/g) || []).length;
    score += mentionCount >= 4 ? 0.15 : 0;

    // Emoji ratio > 15%: +0.2
    const emojiCount = [...text].filter(ch => /\p{Extended_Pictographic}/u.test(ch)).length;
    score += emojiCount / Math.max(text.length, 1) > 0.15 ? 0.2 : 0;

    // Repeated punctuation (3+): +0.1
    score += /[!?！？]{3,}/.test(text) ? 0.1 : 0;

    // Sexual solicitation patterns: +0.35 each, cap 0.7
    const sexHits = TC_CONFIG.SEX_PATTERNS.filter(p => text.includes(p)).length;
    score += Math.min(sexHits * 0.35, 0.7);

    // Very short text (< 5 chars) with multiple emoji: +0.4
    if (text.trim().length < 5 && emojiCount >= 2) {
      score += 0.4;
    }

    // Emoji-only spam: short text with emoji but no real words (just digits/spaces/emoji)
    if (emojiCount >= 2 && text.length < 25) {
      const stripped = text.replace(/[\s\d\p{Extended_Pictographic}]/gu, '');
      if (stripped.length === 0 || /^\d+$/.test(stripped)) {
        score += 0.6;
      }
    }

    // Empty or near-empty text: suspicious
    if (text.trim().length === 0) {
      score += 0.6;
    }

    // Pure digit spam: 2+ digits, nothing else (e.g. "27", "48")
    if (text.trim().length >= 2 && text.trim().length <= 5 && /^\d{2,}$/.test(text.trim())) {
      score += 0.6;
    }

    // Unicode obfuscation: zero-width chars, special combining marks
    if (/[​‌‍﻿⁠­]/.test(text)) {
      score += 0.2;
    }

    // Tech whitelist: reduce score if text contains known tech terms
    const techHits = TC_CONFIG.TECH_WHITELIST.filter(k => lower.includes(k)).length;
    if (techHits >= 1) {
      score *= 0.3;
    }

    // Decorative Unicode wrapping (◌, ⊹, ◙, ▪, etc.) on short text = spam pattern
    if (text.length < 30 && /[◌⊹◙▪▫◻♢◇◆]{1,}/.test(text)) {
      score += 0.5;
    }

    return Math.min(score, 1);
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.TC_RULES = TC_RULES;
}
