if (typeof importScripts === "function") {
  importScripts("dist/browser-polyfill.min.js");
}

const supportedHosts = ["wikipedia.org", "wikivoyage.org"];

const supportedNamespaces = [
  0 // NS_MAIN
];

function isSupportedHost(hostname) {
  for (let i = 0; i < supportedHosts.length; i++) {
    const host = supportedHosts[i];
    if (hostname.endsWith(host)) {
      return true;
    }
  }
  return false;
}

function isSupportedNamespace(ns) {
  return supportedNamespaces.includes(ns);
}

function isSavablePage(path, params) {
  return (
    path.includes("/wiki/") ||
    (path.includes("index.php") && params.has("title"))
  );
}

function shouldShowPageAction(url, ns) {
  return (
    isSupportedHost(url.hostname) &&
    isSupportedNamespace(ns) &&
    isSavablePage(url.pathname, url.searchParams)
  );
}

function initializePageAction(tab) {
  const pageAction = browser.pageAction;
  if (!pageAction || !tab || !tab.url) return;

  const url = new URL(tab.url);
  browser.tabs
    .sendMessage(tab.id, { type: "wikiExtensionGetPageNamespace" })
    .then(res => {
      if (res && shouldShowPageAction(url, res.ns)) {
        pageAction.show(tab.id);
      } else {
        pageAction.hide(tab.id);
      }
    })
    .catch(() => {
      pageAction.hide(tab.id);
    });
}

function initializeAllTabs() {
  browser.tabs.query({}).then(tabs => {
    for (let tab of tabs) initializePageAction(tab);
  });
}

browser.runtime.onInstalled.addListener(() => initializeAllTabs());
browser.runtime.onStartup.addListener(() => initializeAllTabs());

browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    initializePageAction(tab);
  }
});

browser.tabs.onActivated.addListener(activeInfo => {
  browser.tabs.get(activeInfo.tabId).then(tab => initializePageAction(tab));
});

const EXPORT_KEY = "readingListsExport";
const EXPORT_ALARM = "readingListsExportResume";
let exportRunning = false;
let exportStarting = false;

function setExportMessage(job, key, args = []) {
  job.messageKey = key;
  job.messageArgs = args.map(String);
  delete job.message;
}

function exportDelay(response, attempt) {
  const header = response.headers.get("retry-after");
  if (header && header.trim()) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(1000, date - Date.now());
  }
  return Math.min(60000 * 2 ** attempt, 300000);
}

async function saveExport(job) {
  await browser.storage.local.set({ [EXPORT_KEY]: job });
}

async function runExport() {
  if (exportRunning) return;
  exportRunning = true;
  let job;
  try {
    job = (await browser.storage.local.get(EXPORT_KEY))[EXPORT_KEY];
    if (!job || job.state !== "running") return;
    while (job.index < job.lists.length) {
      const wait = (job.nextRequest || 0) - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      const list = job.lists[job.index];
      const params = new URLSearchParams({ action: "query", list: "readinglistentries", rlelists: String(list.id), rlelimit: "max", format: "json" });
      if (job.continuation) params.set("rlecontinue", job.continuation);
      const response = await fetch(`${job.origin}/w/api.php?${params}`, { credentials: "include" });
      if ((response.status === 429 || response.status === 503) && job.attempt < 5) {
        const delay = exportDelay(response, job.attempt++);
        job.nextRequest = Date.now() + delay;
        setExportMessage(job, "exportRetry", [Math.ceil(delay / 1000), job.index, job.lists.length]);
        await saveExport(job);
        continue;
      }
      const body = await response.text();
      let data;
      try { data = JSON.parse(body); } catch (err) {
        throw new Error(browser.i18n.getMessage("apiErrorDetail", [String(response.status), body.trim().slice(0, 160)]));
      }
      if (!response.ok || data.error) throw new Error(data.error?.info || browser.i18n.getMessage("apiErrorStatus", String(response.status)));
      const entries = data.query?.readinglistentries || [];
      for (const entry of entries) {
        let lang = "en";
        try { lang = new URL(entry.project).hostname.replace(/^m\./, "").split(".")[0] || "en"; } catch (err) {}
        job.output[job.index].pages.push({ title: entry.title, lang });
      }
      job.continuation = data.continue?.rlecontinue || null;
      job.attempt = 0;
      job.nextRequest = Date.now() + 1000;
      if (job.continuation) {
        setExportMessage(job, "exportListProgress", [job.index, job.lists.length, job.output[job.index].pages.length, list.name]);
      } else {
        job.index++;
        setExportMessage(job, "exportProgress", [job.index, job.lists.length]);
      }
      await saveExport(job);
    }
    setExportMessage(job, "exportPreparing");
    await saveExport(job);
    await browser.downloads.download({
      url: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ readingListsV1: job.output }, null, 2))}`,
      filename: job.filename,
      conflictAction: "uniquify",
      saveAs: false
    });
    job.state = "complete";
    setExportMessage(job, "exportComplete");
    delete job.output;
    await saveExport(job);
    await browser.alarms.clear(EXPORT_ALARM);
  } catch (err) {
    if (job) {
      job.state = "error";
      setExportMessage(job, "exportFailed", [err.message || String(err)]);
      delete job.output;
      await saveExport(job);
      await browser.alarms.clear(EXPORT_ALARM);
    }
  } finally {
    exportRunning = false;
  }
}

async function startExport(message) {
  if (exportStarting || exportRunning) return { error: browser.i18n.getMessage("exportInProgress") };
  exportStarting = true;
  try {
    const existing = (await browser.storage.local.get(EXPORT_KEY))[EXPORT_KEY];
    if (existing?.state === "running") return { error: browser.i18n.getMessage("exportInProgress") };
    const origin = new URL(message.origin);
    if (origin.protocol !== "https:" || !supportedHosts.some(host => origin.hostname === host || origin.hostname.endsWith(`.${host}`))) {
      return { error: browser.i18n.getMessage("exportUnsupportedOrigin") };
    }
    const lists = message.lists.map(list => ({ id: list.id, name: list.name, description: list.description || "" }));
    const job = {
      state: "running", origin: origin.origin, lists, index: 0, continuation: null,
      output: lists.map(list => ({ name: list.name, description: list.description, pages: [] })),
      filename: message.filename, attempt: 0, nextRequest: 0,
      messageKey: "exportProgress", messageArgs: ["0", String(lists.length)]
    };
    await saveExport(job);
    await browser.alarms.create(EXPORT_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
    runExport();
    return { started: true };
  } finally {
    exportStarting = false;
  }
}

browser.runtime.onMessage.addListener(message => {
  if (message.type === "startReadingListsExport") return startExport(message);
  if (message.type === "getReadingListsExport") {
    return browser.storage.local.get(EXPORT_KEY).then(result => {
      const job = result[EXPORT_KEY];
      if (job?.state === "running") runExport();
      return job ? { state: job.state, message: job.message, messageKey: job.messageKey, messageArgs: job.messageArgs } : null;
    });
  }
});
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === EXPORT_ALARM) runExport();
});
browser.runtime.onStartup.addListener(() => runExport());
