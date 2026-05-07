(() => {
  'use strict';

  const PROCESSED_ATTR = 'tc-processed';

  // SVG icons
  const SVG_SPAM = '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>';
  const SVG_GOOD = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';

  let currentThreshold = TC_CONFIG.THRESHOLD_RULE_ONLY;
  let cachedModel = null;

  chrome.storage.local.get('threshold', (data) => {
    if (data.threshold != null) currentThreshold = data.threshold;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.threshold) {
      currentThreshold = changes.threshold.newValue;
    }
  });

  async function loadModel() {
    const tfidfModel = await TC_MODEL.loadTfidfModel();
    if (tfidfModel) {
      currentThreshold = tfidfModel.threshold || TC_CONFIG.THRESHOLD_WITH_ML;
      return true;
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_MODEL' }, (res) => {
        if (res?.ok && res.model) {
          cachedModel = res.model;
          currentThreshold = TC_CONFIG.THRESHOLD_WITH_ML;
        }
        resolve(true);
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MODEL_UPDATED') {
      cachedModel = msg.model || null;
      if (cachedModel) currentThreshold = TC_CONFIG.THRESHOLD_WITH_ML;
    }
  });

  // --- Tweet extraction ---

  function extractTweetId(article) {
    const link = article.querySelector(TC_CONFIG.SELECTORS.tweetLink);
    if (!link) return null;
    const match = link.href.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function extractTweetText(article) {
    const el = article.querySelector(TC_CONFIG.SELECTORS.tweetText);
    if (!el) return '';
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && node.alt) {
          text += node.alt;
        } else {
          text += node.textContent || '';
        }
      }
    }
    return text.trim();
  }

  function extractAuthor(article) {
    const el = article.querySelector(TC_CONFIG.SELECTORS.userName);
    if (!el) return { handle: '', name: '' };
    const text = el.innerText.trim();
    const lines = text.split('\n').map(s => s.trim());
    const handleLine = lines.find(l => l.startsWith('@')) || '';
    const nameLine = lines.find(l => !l.startsWith('@') && l.length > 0) || '';
    return { handle: handleLine, name: nameLine };
  }

  function isProfileSpam(author) {
    const name = author.name;
    if (!name) return false;
    const keywords = TC_CONFIG.PROFILE_BLOCK_KEYWORDS || [];
    for (const kw of keywords) {
      if (name.includes(kw)) return true;
    }
    if (name.includes('\u{1F338}') && /\d{5,}$/.test(author.handle.replace('@', ''))) {
      return true;
    }
    return false;
  }

  function detectPage() {
    const path = location.pathname;
    if (path === '/home' || path === '/') return 'timeline';
    if (path.includes('/search')) return 'search';
    if (path.includes('/status/')) return 'replies';
    if (path.split('/').length === 2 && path !== '/') return 'profile';
    return 'other';
  }

  function makeLabelData(tweetId, text, author, label, source) {
    return {
      schemaVersion: TC_CONFIG.SCHEMA_VERSION,
      tweetId,
      url: `https://x.com/i/status/${tweetId}`,
      authorHandle: author.handle,
      authorName: author.name,
      text,
      normalizedText: text.toLowerCase().replace(/\s+/g, ' ').trim(),
      label,
      source,
      page: detectPage(),
      createdAt: new Date().toISOString(),
      appVersion: TC_CONFIG.APP_VERSION,
    };
  }

  // --- Scoring ---

  const RULE_HARD_THRESHOLD = 0.70;

  function getScore(text, author, hasMedia) {
    if (author && isProfileSpam(author)) return 1.0;
    if (!text.trim() && hasMedia) return 0;

    const ruleScore = TC_RULES.score(text);
    if (ruleScore >= RULE_HARD_THRESHOLD) return ruleScore;

    const hasTfidfModel = TC_MODEL._tfidfModel != null;
    if (hasTfidfModel || cachedModel) {
      const { combined, mlScore, confidence } = TC_MODEL.combinedScore(text, cachedModel);
      if (confidence < 0.30) return ruleScore;
      return combined;
    }
    return ruleScore;
  }

  // --- Label buttons ---

  function createSvgButton(svgHtml, className, label, onClick) {
    const btn = document.createElement('button');
    btn.className = `tc-label-btn ${className}`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('role', 'button');
    btn.innerHTML = svgHtml;
    btn.querySelector('svg').style.fill = 'currentColor';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }

  function wrapActionButton(btn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'css-175oi2r r-18u37iz r-1h0z5md r-13awgt0';
    wrapper.appendChild(btn);
    return wrapper;
  }

  function injectLabelButtons(article, tweetId, text, author) {
    const actionRow = article.querySelector('[data-testid="reply"]')?.parentElement?.parentElement;
    if (!actionRow) return;

    const spamBtn = createSvgButton(SVG_SPAM, 'tc-btn-spam', 'Mark as spam', (btn) => {
      const isActive = btn.classList.contains('tc-active');
      if (isActive) {
        chrome.runtime.sendMessage({ type: 'UNDO_LABEL', tweetId });
        btn.classList.remove('tc-active');
      } else {
        const labelData = makeLabelData(tweetId, text, author, 'spam', 'manual_spam');
        chrome.runtime.sendMessage({ type: 'LABEL', data: labelData });
        btn.classList.add('tc-active');
        const goodBtn = actionRow.querySelector('.tc-btn-good');
        if (goodBtn) goodBtn.classList.remove('tc-active');
      }
    });

    const goodBtn = createSvgButton(SVG_GOOD, 'tc-btn-good', 'Mark as good', (btn) => {
      const isActive = btn.classList.contains('tc-active');
      if (isActive) {
        chrome.runtime.sendMessage({ type: 'UNDO_LABEL', tweetId });
        btn.classList.remove('tc-active');
      } else {
        const labelData = makeLabelData(tweetId, text, author, 'good', 'manual_good');
        chrome.runtime.sendMessage({ type: 'LABEL', data: labelData });
        btn.classList.add('tc-active');
        const spamBtnEl = actionRow.querySelector('.tc-btn-spam');
        if (spamBtnEl) spamBtnEl.classList.remove('tc-active');
      }
    });

    const firstBtn = actionRow.firstElementChild;
    actionRow.insertBefore(wrapActionButton(spamBtn), firstBtn);
    actionRow.insertBefore(wrapActionButton(goodBtn), firstBtn);
  }

  // --- Main processing ---

  function injectButtons(article) {
    const tweetId = extractTweetId(article);
    if (!tweetId) return;

    const text = extractTweetText(article);
    const author = extractAuthor(article);

    if (!text.trim()) {
      injectLabelButtons(article, tweetId, text, author);
      return;
    }

    const hasMedia = !!article.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]');
    const score = getScore(text, author, hasMedia);
    if (score >= currentThreshold) {
      article.remove();
      return;
    }

    injectLabelButtons(article, tweetId, text, author);
  }

  // --- DOM observer ---

  let processTimer = null;

  function processTweets() {
    const articles = document.querySelectorAll(TC_CONFIG.SELECTORS.tweet);
    for (const article of articles) {
      if (article.hasAttribute(PROCESSED_ATTR)) continue;
      article.setAttribute(PROCESSED_ATTR, 'true');
      injectButtons(article);
    }
  }

  function scheduleProcess() {
    if (processTimer) return;
    processTimer = requestAnimationFrame(() => {
      processTimer = null;
      processTweets();
    });
  }

  loadModel().then(() => {
    const observer = new MutationObserver(scheduleProcess);
    observer.observe(document.body, { childList: true, subtree: true });
    processTweets();
  });

  // --- SPA navigation ---

  let lastUrl = location.href;

  function onNavigation() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(processTweets, 100);
  }

  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    onNavigation();
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    onNavigation();
  };

  window.addEventListener('popstate', onNavigation);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PING') {
      sendResponse({ ok: true });
    }
  });
})();
