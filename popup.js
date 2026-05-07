document.addEventListener('DOMContentLoaded', () => {
  const statSpam = document.getElementById('stat-spam');
  const statGood = document.getElementById('stat-good');
  const statTotal = document.getElementById('stat-total');
  const modelStatus = document.getElementById('model-status');
  const btnTrain = document.getElementById('btn-train');
  const btnSync = document.getElementById('btn-sync');
  const syncStatus = document.getElementById('sync-status');
  const btnExport = document.getElementById('btn-export');
  const fileImport = document.getElementById('file-import');
  const thresholdSlider = document.getElementById('threshold-slider');
  const thresholdVal = document.getElementById('threshold-val');
  const btnClear = document.getElementById('btn-clear');

  function refreshStats() {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (res) => {
      if (!res?.ok) return;
      statSpam.textContent = res.stats.spam;
      statGood.textContent = res.stats.good;
      statTotal.textContent = res.stats.total;

      if (res.modelInfo) {
        const d = new Date(res.modelInfo.trainedAt);
        const timeStr = d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        modelStatus.textContent = `已训练 · ${res.modelInfo.sampleCount} 样本 · ${res.modelInfo.vocabSize} 特征 · ${timeStr}`;
        modelStatus.classList.add('tc-model-trained');
      } else {
        modelStatus.textContent = '未训练';
        modelStatus.classList.remove('tc-model-trained');
      }
    });
  }

  refreshStats();

  // Load threshold
  chrome.storage.local.get('threshold', (data) => {
    const val = data.threshold ?? TC_CONFIG.THRESHOLD_RULE_ONLY;
    thresholdSlider.value = val;
    thresholdVal.textContent = val.toFixed(2);
  });

  thresholdSlider.addEventListener('input', () => {
    const val = parseFloat(thresholdSlider.value);
    thresholdVal.textContent = val.toFixed(2);
    chrome.storage.local.set({ threshold: val });
  });

  // Train
  btnTrain.addEventListener('click', () => {
    btnTrain.disabled = true;
    btnTrain.textContent = '训练中...';

    chrome.runtime.sendMessage({ type: 'TRAIN' }, (res) => {
      btnTrain.disabled = false;
      btnTrain.textContent = '训练模型';

      if (res?.error) {
        alert(`训练失败: ${res.error}`);
        return;
      }

      if (res?.ok) {
        refreshStats();
      }
    });
  });

  // Sync from GitHub
  btnSync.addEventListener('click', () => {
    btnSync.disabled = true;
    btnSync.textContent = '同步中...';
    syncStatus.textContent = '';

    chrome.runtime.sendMessage({ type: 'SYNC_GITHUB' }, (res) => {
      btnSync.disabled = false;
      btnSync.textContent = '从 GitHub 同步数据';

      if (res?.error) {
        syncStatus.textContent = `同步失败: ${res.error}`;
        syncStatus.classList.add('tc-sync-error');
        return;
      }

      if (res?.ok) {
        syncStatus.textContent = `同步完成，导入 ${res.imported} 条记录`;
        syncStatus.classList.remove('tc-sync-error');
        syncStatus.classList.add('tc-sync-success');
        refreshStats();
      }
    });
  });

  // Export
  btnExport.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_JSONL' }, (res) => {
      if (!res?.ok) return;
      const blob = new Blob([res.jsonl], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `twitter-cleaner-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Import
  fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      chrome.runtime.sendMessage({ type: 'IMPORT_JSONL', jsonl: reader.result }, (res) => {
        if (res?.ok) {
          alert(`导入成功: ${res.imported} 条记录`);
          refreshStats();
        }
      });
    };
    reader.readAsText(file);
    fileImport.value = '';
  });

  // Clear
  btnClear.addEventListener('click', () => {
    if (!confirm('确定清空所有标注数据？此操作不可撤销。')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (res) => {
      if (res?.ok) {
        statSpam.textContent = '0';
        statGood.textContent = '0';
        statTotal.textContent = '0';
        modelStatus.textContent = '未训练';
        modelStatus.classList.remove('tc-model-trained');
      }
    });
  });
});
