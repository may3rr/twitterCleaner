const TC_MODEL = {
  _tfidfModel: null,
  _vocabMap: null,

  // Load pre-trained TF-IDF model
  async loadTfidfModel() {
    try {
      const url = chrome.runtime.getURL('tfidf_model.json');
      const res = await fetch(url);
      if (!res.ok) return null;
      const model = await res.json();
      this._tfidfModel = model;
      // Build vocab index map for fast lookup
      this._vocabMap = new Map();
      for (let i = 0; i < model.vocab.length; i++) {
        this._vocabMap.set(model.vocab[i], i);
      }
      return model;
    } catch (e) {
      return null;
    }
  },

  // Extract char n-grams (2, 3, 4) matching sklearn's char_wb analyzer
  extractCharNgrams(text) {
    const chars = [...text];
    const ngrams = [];
    // char_wb: n-grams within word boundaries, padded with spaces
    // For simplicity, we treat the whole text as one "word" with space padding
    const padded = [' ', ...chars, ' '];
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i <= padded.length - n; i++) {
        ngrams.push(padded.slice(i, i + n).join(''));
      }
    }
    return ngrams;
  },

  // Score text using TF-IDF + Naive Bayes
  scoreTfidf(text) {
    if (!this._tfidfModel || !this._vocabMap) {
      return { mlScore: 0.5, confidence: 0 };
    }

    const model = this._tfidfModel;
    const ngrams = this.extractCharNgrams(text);

    // Count TF for each n-gram
    const tfCounts = new Map();
    for (const ng of ngrams) {
      tfCounts.set(ng, (tfCounts.get(ng) || 0) + 1);
    }

    // Compute log-probability scores
    let logSpam = model.spamPrior;
    let logGood = model.goodPrior;

    for (const [ng, count] of tfCounts) {
      const idx = this._vocabMap.get(ng);
      if (idx !== undefined) {
        // Sublinear TF: 1 + log(count)
        const tf = count > 0 ? (1 + Math.log(count)) : 0;
        const tfidf = tf * model.idf[idx];
        logSpam += tfidf * model.spamLogProbs[idx];
        logGood += tfidf * model.goodLogProbs[idx];
      }
    }

    const margin = logSpam - logGood;
    const mlScore = 1 / (1 + Math.exp(-margin));
    const confidence = Math.abs(mlScore - 0.5) * 2;

    return { mlScore, confidence };
  },

  // --- Legacy feature extraction (kept for backward compatibility) ---

  extractFeatures(text) {
    const features = [];

    const chars = [...text];
    const cjkCount = chars.filter(c => c >= '一' && c <= '鿿').length;
    const cjkRatio = cjkCount / Math.max(chars.length, 1);
    if (cjkRatio < 0.5) {
      for (let i = 0; i < chars.length - 1; i++) {
        features.push(`c2:${chars[i]}${chars[i + 1]}`);
      }
      for (let i = 0; i < chars.length - 2; i++) {
        features.push(`c3:${chars[i]}${chars[i + 1]}${chars[i + 2]}`);
      }
    }

    const words = text.toLowerCase().split(/[\s,.\-!?！？、。，；：""''（）()\[\]{}]+/).filter(w => w.length > 0);
    for (const w of words) {
      features.push(`w:${w}`);
    }

    const lower = text.toLowerCase();
    const keywordHits = TC_CONFIG.SPAM_KEYWORDS.filter(k => lower.includes(k.toLowerCase())).length;
    features.push(`kw:${Math.min(keywordHits, 5)}`);

    const urlCount = (text.match(/https?:\/\/|t\.co\//g) || []).length;
    features.push(`urls:${Math.min(urlCount, 5)}`);

    const emojiCount = [...text].filter(ch => /\p{Extended_Pictographic}/u.test(ch)).length;
    const emojiRatio = emojiCount / Math.max(text.length, 1);
    if (emojiRatio > 0.25) features.push('emoji:high');
    else if (emojiRatio > 0.15) features.push('emoji:med');
    else features.push('emoji:low');

    if (/[!?！？]{3,}/.test(text)) features.push('punctburst:1');

    const mentionCount = (text.match(/@\w+/g) || []).length;
    features.push(`mentions:${Math.min(mentionCount, 8)}`);

    return features;
  },

  // --- Legacy training (kept for manual retrain) ---

  train(labels) {
    if (labels.length < 10) {
      return { error: 'Need at least 10 labels to train' };
    }

    const spamLabels = labels.filter(l => l.label === 'spam');
    const goodLabels = labels.filter(l => l.label === 'good');

    if (spamLabels.length < 5 || goodLabels.length < 5) {
      return { error: 'Need at least 5 spam and 5 good labels' };
    }

    const spamFeatureCounts = {};
    const goodFeatureCounts = {};
    let spamTotalFeatures = 0;
    let goodTotalFeatures = 0;

    for (const label of spamLabels) {
      const features = this.extractFeatures(label.text);
      const limited = features.slice(0, TC_CONFIG.MAX_FEATURES_PER_TWEET);
      for (const f of limited) {
        spamFeatureCounts[f] = (spamFeatureCounts[f] || 0) + 1;
        spamTotalFeatures++;
      }
    }

    for (const label of goodLabels) {
      const features = this.extractFeatures(label.text);
      const limited = features.slice(0, TC_CONFIG.MAX_FEATURES_PER_TWEET);
      for (const f of limited) {
        goodFeatureCounts[f] = (goodFeatureCounts[f] || 0) + 1;
        goodTotalFeatures++;
      }
    }

    const allFeatures = new Set();
    for (const [f, count] of Object.entries(spamFeatureCounts)) {
      if (count >= TC_CONFIG.MIN_FEATURE_COUNT) allFeatures.add(f);
    }
    for (const [f, count] of Object.entries(goodFeatureCounts)) {
      if (count >= TC_CONFIG.MIN_FEATURE_COUNT) allFeatures.add(f);
    }

    let vocab = [...allFeatures];
    if (vocab.length > TC_CONFIG.MAX_VOCAB_SIZE) {
      const totalCounts = {};
      for (const f of vocab) {
        totalCounts[f] = (spamFeatureCounts[f] || 0) + (goodFeatureCounts[f] || 0);
      }
      vocab.sort((a, b) => totalCounts[b] - totalCounts[a]);
      vocab = vocab.slice(0, TC_CONFIG.MAX_VOCAB_SIZE);
    }

    const vocabSize = vocab.length;
    const spamLogProbs = {};
    const goodLogProbs = {};

    for (const f of vocab) {
      const spamCount = spamFeatureCounts[f] || 0;
      const goodCount = goodFeatureCounts[f] || 0;
      spamLogProbs[f] = Math.log((spamCount + 1) / (spamTotalFeatures + vocabSize));
      goodLogProbs[f] = Math.log((goodCount + 1) / (goodTotalFeatures + vocabSize));
    }

    const priorSpam = spamLabels.length / labels.length;
    const priorGood = goodLabels.length / labels.length;

    const model = {
      version: Date.now(),
      trainedAt: Date.now(),
      sampleCount: labels.length,
      spamCount: spamLabels.length,
      goodCount: goodLabels.length,
      vocabSize: vocab.length,
      priorSpam,
      priorGood,
      spamLogProbs,
      goodLogProbs,
      spamLogProbUnknown: Math.log(1 / (spamTotalFeatures + vocabSize)),
      goodLogProbUnknown: Math.log(1 / (goodTotalFeatures + vocabSize)),
    };

    return { ok: true, model };
  },

  // --- Scoring ---

  score(text, model) {
    // Prefer TF-IDF model if loaded
    if (this._tfidfModel) {
      return this.scoreTfidf(text);
    }

    // Fallback to legacy model
    if (!model) return { mlScore: 0.5, confidence: 0 };

    const features = this.extractFeatures(text);
    const limited = features.slice(0, TC_CONFIG.MAX_FEATURES_PER_TWEET);

    let logSpam = Math.log(model.priorSpam);
    let logGood = Math.log(model.priorGood);

    for (const f of limited) {
      logSpam += model.spamLogProbs[f] !== undefined
        ? model.spamLogProbs[f]
        : model.spamLogProbUnknown;
      logGood += model.goodLogProbs[f] !== undefined
        ? model.goodLogProbs[f]
        : model.goodLogProbUnknown;
    }

    const margin = logSpam - logGood;
    const mlScore = 1 / (1 + Math.exp(-margin));
    const confidence = Math.abs(mlScore - 0.5) * 2;

    return { mlScore, confidence };
  },

  // Combined score: ML + rules
  combinedScore(text, model) {
    const ruleScore = TC_RULES.score(text);
    const { mlScore, confidence } = this.score(text, model);

    if (!model && !this._tfidfModel) {
      return { combined: ruleScore, ruleScore, mlScore: 0.5, confidence: 0 };
    }

    let adjustedMl = mlScore;

    // CJK text with real English words (not @handles) → likely tech discussion
    const lower = text.toLowerCase();
    const hasCJK = /[一-鿿]/.test(text);
    const englishWords = text.match(/(?<![@\/])[a-zA-Z]{4,}/g) || [];
    const realEnglishWords = englishWords.filter(w => !w.startsWith('http'));
    const techHits = (TC_CONFIG.TECH_WHITELIST || []).filter(k => lower.includes(k)).length;
    if (hasCJK && realEnglishWords.length >= 1 && ruleScore < 0.3) {
      adjustedMl = mlScore * 0.6;
    } else if (techHits >= 1 && ruleScore < 0.3) {
      adjustedMl = mlScore * 0.5;
    }

    // Decorative Unicode wrapping pattern (mirrors rules.js)
    if (text.length < 30 && /[◌⊹◙▪▫◻♢◇◆]{1,}/.test(text)) {
      adjustedMl = Math.min(adjustedMl + 0.3, 1.0);
    }

    const combined = TC_CONFIG.ML_WEIGHT * adjustedMl + TC_CONFIG.RULE_WEIGHT * ruleScore;
    return { combined, ruleScore, mlScore: adjustedMl, confidence };
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.TC_MODEL = TC_MODEL;
}
