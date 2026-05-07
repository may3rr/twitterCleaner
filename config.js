const TC_CONFIG = {
  APP_VERSION: '0.2.0',
  SCHEMA_VERSION: 1,

  // DOM selectors — update here when X.com changes
  SELECTORS: {
    tweet: 'article[data-testid="tweet"]',
    tweetText: '[data-testid="tweetText"]',
    userName: '[data-testid="User-Name"]',
    tweetLink: 'a[href*="/status/"]',
  },

  // Filtering thresholds
  THRESHOLD_RULE_ONLY: 0.70,
  THRESHOLD_WITH_ML: 0.60,

  // ML weights for combined score
  ML_WEIGHT: 0.6,
  RULE_WEIGHT: 0.4,

  // Naive Bayes safeguards
  MAX_VOCAB_SIZE: 30000,
  MIN_FEATURE_COUNT: 2,
  MAX_FEATURES_PER_TWEET: 500,

  // Spam keywords (used by both rules and ML features)
  SPAM_KEYWORDS: [
    '空投', '福利', '返佣', '带单', '合约', '加群', '进群', '私信',
    '课程', '训练营', '免费领取', '稳赚', '暴富', '副业',
    'airdrop', 'crypto', 'giveaway', 'dm me', 'join', 'telegram', 'discord'
  ],

  // Sexual solicitation patterns (regex-ready strings)
  SEX_PATTERNS: [
    '主人', '求主人', '领我', '认识吗', '想认识', '弟弟想',
    '温柔', '小狗求', '抱抱', '好涩', '好骚', '比她骚',
    '没人比她', '线下', '能打', '推特第一',
    '主页', '就她的', '就他的',
    // from x-block
    '哥哥', '弟弟', '单身哥哥', '单身弟弟', '会疼人', '快来领我',
    '约p', '同城', '骚货', '她sao', 'sao货', '真人认识',
    '约炮', '破处', '附近', '长期搭子', '搭子',
  ],

  // Profile-level spam signals
  PROFILE_BLOCK_KEYWORDS: ['约炮', '同城', '免费', '破处', '约p', '主页', '附近'],

  // English tech terms that are NOT spam (reduce ML false positives)
  TECH_WHITELIST: [
    'encryption', 'locals', 'endtoend', 'bluetooth', 'wifi', 'firmware',
    'github', 'docker', 'kubernetes', 'linux', 'server', 'api', 'sdk',
    'deepseek', 'openai', 'anthropic', 'claude', 'gpt', 'llm',
  ],

  // Undo toast duration (ms)
  UNDO_DURATION: 5000,

  // Auto-retrain after this many new labels since last training
  AUTO_RETRAIN_THRESHOLD: 20,

  // GitHub sync: raw URL to the community training data
  GITHUB_SYNC_URL: 'https://raw.githubusercontent.com/may3rr/twitterCleaner/main/training_data.jsonl',
};

// Make available in both content script and service worker contexts
if (typeof globalThis !== 'undefined') {
  globalThis.TC_CONFIG = TC_CONFIG;
}
