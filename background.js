importScripts('config.js', 'db.js', 'rules.js', 'model.js');

function broadcastToTabs(message) {
  chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => {
    console.error('[TC] Background error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'LABEL': {
      await TC_DB.saveLabel(msg.data);
      const stats = await TC_DB.getStats();
      return { ok: true, stats };
    }

    case 'UNDO_LABEL': {
      await TC_DB.deleteLabel(msg.tweetId);
      const stats = await TC_DB.getStats();
      return { ok: true, stats };
    }

    case 'GET_STATS': {
      const stats = await TC_DB.getStats();
      const model = await TC_DB.getLatestModel();
      return {
        ok: true,
        stats,
        modelInfo: model ? {
          trainedAt: model.trainedAt,
          sampleCount: model.sampleCount,
          vocabSize: model.vocabSize,
          spamCount: model.spamCount,
          goodCount: model.goodCount,
        } : null,
      };
    }

    case 'TRAIN': {
      const labels = await TC_DB.getAllLabels();
      const result = TC_MODEL.train(labels);
      if (result.error) return result;

      await TC_DB.saveModel(result.model);

      // Broadcast model update to all content scripts
      broadcastToTabs({ type: 'MODEL_UPDATED', model: result.model });

      return {
        ok: true,
        modelInfo: {
          trainedAt: result.model.trainedAt,
          sampleCount: result.model.sampleCount,
          vocabSize: result.model.vocabSize,
          spamCount: result.model.spamCount,
          goodCount: result.model.goodCount,
        },
      };
    }

    case 'GET_MODEL': {
      const model = await TC_DB.getLatestModel();
      return { ok: true, model };
    }

    case 'SCORE': {
      const model = await TC_DB.getLatestModel();
      const result = TC_MODEL.combinedScore(msg.text, model);
      return { ok: true, ...result };
    }

    case 'EXPORT_JSONL': {
      const jsonl = await TC_DB.exportJSONL();
      return { ok: true, jsonl };
    }

    case 'IMPORT_JSONL': {
      const count = await TC_DB.importJSONL(msg.jsonl);
      const stats = await TC_DB.getStats();
      return { ok: true, imported: count, stats };
    }

    case 'CLEAR_ALL': {
      await TC_DB.clearAll();
      return { ok: true };
    }

    case 'GET_ALL_LABELS': {
      const labels = await TC_DB.getAllLabels();
      return { ok: true, labels };
    }

    case 'SYNC_GITHUB': {
      const url = msg.url || TC_CONFIG.GITHUB_SYNC_URL;
      const res = await fetch(url);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const jsonl = await res.text();
      const count = await TC_DB.importJSONL(jsonl);
      const stats = await TC_DB.getStats();
      return { ok: true, imported: count, stats };
    }

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}
