const MESSAGE_KEYS = {
  enableSync: "readinglists-browser-enable-sync-prompt",
  listLimitExceeded: "readinglists-browser-list-limit-exceeded",
  entryLimitExceeded: "readinglists-browser-list-entry-limit-exceeded",
  errorIntro: "readinglists-browser-error-intro",
  infoLinkText: "readinglists-browser-extension-info-link-text",
  loginButtonText: "login",
  loginPrompt: "readinglists-browser-login-prompt",
  addSuccess: "readinglists-browser-add-entry-success",
  moveSuccess: "readinglists-browser-move-entry-success",
  removeSuccess: "readinglists-browser-remove-entry-success",
  unsupportedPage: "readinglists-browser-unsupported-page"
};

const ALLMESSAGES_QUERY = {
  action: "query",
  format: "json",
  formatversion: "2",
  meta: "allmessages",
  amenableparser: ""
};

let allReadingLists = [];
let listSelectionContext = null;
let currentViewedList = null;
let currentListEntries = [];
let moveEntryContext = null;
let isDeleteMode = false;
let currentSummaryEntry = null;
let isUpdateMode = false;
let currentUpdatingList = null;
const SUPPORTED_HOSTS = ["wikipedia.org", "wikivoyage.org"];
const SUPPORTED_NAMESPACES = [0];

function objToQueryString(obj) {
  return Object.keys(obj)
    .map(key => `${key}=${obj[key]}`)
    .join("&");
}

function isSupportedHost(hostname) {
  return SUPPORTED_HOSTS.some(host => hostname.endsWith(host));
}

function isSavablePage(path, params) {
  return (
    path.includes("/wiki/") ||
    (path.includes("index.php") && params.has("title"))
  );
}

function isSupportedNamespace(ns) {
  return SUPPORTED_NAMESPACES.includes(ns);
}

function getReadingListsUrlForOrigin(origin, rlcontinue) {
  let result = `${origin}/w/api.php?action=query&meta=readinglists&rllimit=max&format=json`;
  if (rlcontinue) {
    result = result.concat(`&rlcontinue=${encodeURIComponent(rlcontinue)}`);
  }
  return result;
}

function readingListCreateEntryUrlForOrigin(origin) {
  return `${origin}/w/api.php?action=readinglists&command=createentry&format=json`;
}

function readingListEntriesUrlForOrigin(origin, listId, rlecontinue) {
  let result = `${origin}/w/api.php?action=query&list=readinglistentries&rlelists=${encodeURIComponent(
    listId
  )}&rlelimit=max&format=json`;
  if (rlecontinue) {
    result = result.concat(`&rlecontinue=${encodeURIComponent(rlecontinue)}`);
  }
  return result;
}

function readingListDeleteEntryUrlForOrigin(origin) {
  return `${origin}/w/api.php?action=readinglists&command=deleteentry&format=json`;
}

function readingListCreateUrlForOrigin(origin) {
  return `${origin}/w/api.php?action=readinglists&command=create&format=json`;
}

function readingListDeleteUrlForOrigin(origin) {
  return `${origin}/w/api.php?action=readinglists&command=delete&format=json`;
}

function readingListUpdateUrlForOrigin(origin) {
  return `${origin}/w/api.php?action=readinglists&command=update&format=json`;
}

function pageSummaryUrlForEntry(entry) {
  return `${entry.project}/api/rest_v1/page/summary/${encodeURIComponent(
    entry.title.replace(/ /g, "_")
  )}`;
}

function readingListEntryLookupUrlForOrigin(origin, title, project) {
  return `${origin}/w/api.php?action=query&meta=readinglists&rlproject=${encodeURIComponent(
    project
  )}&rltitle=${encodeURIComponent(title)}&format=json`;
}

function csrfFetchUrlForOrigin(origin) {
  return `${origin}/w/api.php?action=query&format=json&formatversion=2&meta=tokens&type=csrf`;
}

function geti18nMessageUrl(origin, keys) {
  return `${origin}/w/api.php?${objToQueryString(
    Object.assign(ALLMESSAGES_QUERY, { ammessages: keys.join("|") })
  )}`;
}

function fetchBundledMessagesForLang(lang) {
  return fetch(browser.runtime.getURL(`i18n/${lang}.json`));
}

function getBundledMessage(lang, keys) {
  return fetchBundledMessagesForLang(lang)
    .then(res => res.json())
    .then(res => {
      const result = {};
      keys.forEach(key => {
        result[key] = res[key];
      });
      return result;
    });
}

/**
 * Get UI messages from the MediaWiki API (in the user's preferred UI lang), falling back to bundled
 * English strings if this fails.
 * @param {string} origin the origin of the site URL
 * @param {Array[string]} keys message keys to request
 */
function geti18nMessages(origin, keys) {
  return fetch(geti18nMessageUrl(origin, keys), { credentials: "same-origin" })
    .then(res => {
      if (!res.ok) {
        throw res;
      } else {
        return res.json();
      }
    })
    .then(res => {
      const result = {};
      if (res.query && res.query.allmessages && res.query.allmessages.length) {
        res.query.allmessages.forEach(messageObj => {
          if (
            messageObj &&
            messageObj.name &&
            messageObj.content &&
            !/^⧼.+⧽$/.test(messageObj.content)
          ) {
            result[messageObj.name] = messageObj.content;
          }
        });
      }
      return getBundledMessage("en", keys).then(bundled =>
        Object.assign({}, bundled, result)
      );
    })
    .catch(() => getBundledMessage("en", keys));
}

function getCurrentTab() {
  return browser.tabs
    .query({ currentWindow: true, active: true })
    .then(tabs => tabs[0]);
}

function getCsrfToken(origin) {
  return fetch(csrfFetchUrlForOrigin(origin), { credentials: "same-origin" })
    .then(res => res.json())
    .then(res => res.query.tokens.csrftoken);
}

function getReadingListsPage(url, rlcontinue) {
  return fetch(getReadingListsUrlForOrigin(url.origin, rlcontinue), {
    credentials: "same-origin"
  })
    .then(res => {
      if (res.status < 200 || res.status > 399) {
        return res.json().then(res => {
          // Must be thrown from here for Firefox
          throw res;
        });
      } else {
        return res.json();
      }
    })
    .then(res => {
      return res;
    });
}

function getAllReadingLists(url, rlcontinue, lists) {
  const combined = lists || [];
  return getReadingListsPage(url, rlcontinue).then(res => {
    const pageLists =
      res && res.query && res.query.readinglists ? res.query.readinglists : [];
    const nextLists = combined.concat(pageLists);
    const nextContinue =
      res && res.continue && res.continue.rlcontinue
        ? res.continue.rlcontinue
        : null;
    if (nextContinue) {
      return getAllReadingLists(url, nextContinue, nextLists);
    }
    return nextLists;
  });
}

function parseTitleFromUrl(href) {
  const url = new URL(href);
  const rawTitle = url.searchParams.has("title")
    ? url.searchParams.get("title")
    : url.pathname.replace("/wiki/", "");
  try {
    return decodeURIComponent(rawTitle);
  } catch (err) {
    return rawTitle;
  }
}

function show(id) {
  // Use setTimeout to work around an extension popup resizing bug on Chrome
  // see https://bugs.chromium.org/p/chromium/issues/detail?id=428044
  setTimeout(() => {
    document.getElementById(id).style.display = "block";
  }, 200);
}

function hide(id) {
  document.getElementById(id).style.display = "none";
}

function setListStatus(text) {
  const status = document.getElementById("listStatus");
  if (text) {
    status.textContent = text;
    status.style.display = "block";
  } else {
    status.textContent = "";
    status.style.display = "none";
  }
}

function setListLoading(isLoading) {
  document.getElementById("listLoading").style.display = isLoading
    ? "flex"
    : "none";
}

function setCreateListStatus(text) {
  const status = document.getElementById("createListStatus");
  if (text) {
    status.textContent = text;
    status.style.display = "block";
  } else {
    status.textContent = "";
    status.style.display = "none";
  }
}

function setUpdateListStatus(text) {
  const status = document.getElementById("updateListStatus");
  if (text) {
    status.textContent = text;
    status.style.display = "block";
  } else {
    status.textContent = "";
    status.style.display = "none";
  }
}

function getEntryLimitFromError(res) {
  const candidates = [res && res.info, res && res.detail, res && res.message]
    .filter(Boolean)
    .map(String);
  for (const candidate of candidates) {
    const match = candidate.match(/(\d+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function setArticleSummaryLoading(isLoading) {
  document.getElementById("articleSummaryLoading").style.display = isLoading
    ? "flex"
    : "none";
}

function setArticleSummaryStatus(text) {
  const status = document.getElementById("articleSummaryStatus");
  if (text) {
    status.textContent = text;
    status.style.display = "block";
  } else {
    status.textContent = "";
    status.style.display = "none";
  }
}

function normalizeListName(name) {
  return (name || "").toLowerCase();
}

function renderReadingLists() {
  const listResults = document.getElementById("listResults");
  const listEmpty = document.getElementById("listEmpty");
  const filter = normalizeListName(
    document.getElementById("listSearchInput").value
  );

  listResults.textContent = "";
  const filtered = allReadingLists.filter(list =>
    normalizeListName(list.name).includes(filter)
  );

  if (!filtered.length) {
    listEmpty.style.display = "block";
    return;
  }

  listEmpty.style.display = "none";
  filtered.forEach(list => {
    const listItem = document.createElement("li");
    const listRow = document.createElement("div");
    listRow.className = "listRow";
    if (list.description) {
      listRow.title = list.description;
    }
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "listViewIconButton";
    viewButton.title = `View articles in "${list.name}"`;
    viewButton.setAttribute("aria-label", `View articles in ${list.name}`);
    const viewIconGlyph = document.createElement("span");
    viewIconGlyph.className = "listViewIcon";
    viewButton.appendChild(viewIconGlyph);
    viewButton.addEventListener("click", event => {
      event.stopPropagation();
      handleListViewSelection(list);
    });
    if (list.description) {
      viewButton.title = `${viewButton.title}\n${list.description}`;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "listButton";
    button.dataset.listId = list.id;
    if (list.description) {
      button.title = list.description;
    }

    const name = document.createElement("span");
    name.className = "listName";
    name.textContent = list.name;
    button.appendChild(name);

    const meta = document.createElement("span");
    meta.className = "listMeta";

    const badges = document.createElement("span");
    badges.className = "listMetaBadges";

    if (list.default) {
      const defaultTag = document.createElement("span");
      defaultTag.className = "listDefaultTag";
      defaultTag.textContent = "Default";
      badges.appendChild(defaultTag);
    }

    const sizeColumn = document.createElement("span");
    sizeColumn.className = "listMetaSizeColumn";
    if (typeof list.size === "number") {
      const sizeTag = document.createElement("span");
      sizeTag.className = "listSizeTag";
      sizeTag.textContent = `${list.size}`;
      sizeColumn.appendChild(sizeTag);
    }

    const actionColumn = document.createElement("span");
    actionColumn.className = "listMetaActionColumn";
    if (list.hasEntry) {
      const savedIcon = document.createElement("button");
      savedIcon.type = "button";
      savedIcon.className = "listSavedIconButton";
      savedIcon.title = "Remove from this list";
      savedIcon.setAttribute("aria-label", "Remove from this list");
      const savedIconGlyph = document.createElement("span");
      savedIconGlyph.className = "listSavedIcon";
      savedIcon.appendChild(savedIconGlyph);
      savedIcon.addEventListener("click", event => {
        event.stopPropagation();
        handleSavedListRemoval(list);
      });
      actionColumn.appendChild(savedIcon);
    }

    if (badges.childNodes.length) {
      meta.appendChild(badges);
    }
    meta.appendChild(sizeColumn);
    meta.appendChild(actionColumn);

    if (isDeleteMode) {
      button.addEventListener("click", () => handleReadingListDeletion(list));
    } else if (isUpdateMode) {
      button.addEventListener("click", () => handleReadingListUpdateSelection(list));
    } else if (list.hasEntry) {
      button.addEventListener("click", () => {});
    } else {
      button.addEventListener("click", () => handleListSelection(list));
    }
    viewButton.disabled = isDeleteMode || isUpdateMode;
    listRow.appendChild(viewButton);
    listRow.appendChild(button);
    listRow.appendChild(meta);
    listItem.appendChild(listRow);
    listResults.appendChild(listItem);
  });
}

function setListUiDisabled(disabled) {
  document.getElementById("listSearchInput").disabled = disabled;
  document
    .querySelectorAll(
      ".listButton, .listSavedIconButton, .listViewIconButton, .headerIconButton"
    )
    .forEach(button => {
      button.disabled = disabled;
    });
}

function setListSelectionContextEntries(listId, hasEntry) {
  allReadingLists = allReadingLists.map(list =>
    list.id === listId ? Object.assign({}, list, { hasEntry }) : list
  );
  renderReadingLists();
}

function setSavedRowUiState(listId, hasEntry) {
  setListSelectionContextEntries(listId, hasEntry);
}

function getEntryLang(entry) {
  try {
    const hostname = new URL(entry.project).hostname.replace(/^m\./, "");
    return hostname.split(".")[0] || "en";
  } catch (err) {
    return "en";
  }
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function sanitizeExportFilename(name) {
  return String(name || "Reading list").replace(/[\\/:*?"<>|]/g, "_");
}

function setDeleteMode(enabled) {
  if (enabled && isUpdateMode) {
    setUpdateMode(false);
  }
  isDeleteMode = enabled;
  document
    .getElementById("deleteReadingListButton")
    .classList.toggle("active", enabled);
  setListStatus(enabled ? "Select a reading list to delete." : "");
  renderReadingLists();
}

function setUpdateMode(enabled) {
  if (enabled && isDeleteMode) {
    setDeleteMode(false);
  }
  isUpdateMode = enabled;
  document
    .getElementById("updateReadingListButton")
    .classList.toggle("active", enabled);
  setListStatus(enabled ? "Select a reading list to update." : "");
  renderReadingLists();
}

function updateListSize(listId, delta) {
  allReadingLists = allReadingLists.map(list => {
    if (list.id !== listId || typeof list.size !== "number") return list;
    return Object.assign({}, list, { size: Math.max(0, list.size + delta) });
  });
  renderReadingLists();
}

function refreshSavedListStatuses() {
  if (!listSelectionContext) return Promise.resolve();
  return markListsWithEntryStatus(
    listSelectionContext.tab,
    listSelectionContext.url,
    allReadingLists
  )
    .then(updatedLists => {
      allReadingLists = updatedLists;
      renderReadingLists();
    })
    .catch(() => {});
}

function showListSelection() {
  if (isDeleteMode) {
    setDeleteMode(false);
  }
  if (isUpdateMode) {
    setUpdateMode(false);
  }
  hide("createListContainer");
  hide("updateListContainer");
  hide("listEntriesContainer");
  hide("articleSummaryContainer");
  hide("moveEntryContainer");
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  show("listSelectionContainer");
}

function showCreateListView() {
  hide("listSelectionContainer");
  hide("updateListContainer");
  hide("listEntriesContainer");
  hide("articleSummaryContainer");
  hide("moveEntryContainer");
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  setCreateListStatus("");
  show("createListContainer");
}

function showUpdateListView() {
  hide("createListContainer");
  hide("listSelectionContainer");
  hide("listEntriesContainer");
  hide("articleSummaryContainer");
  hide("moveEntryContainer");
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  setUpdateListStatus("");
  show("updateListContainer");
}

function showListEntriesView() {
  hide("createListContainer");
  hide("updateListContainer");
  hide("listSelectionContainer");
  hide("articleSummaryContainer");
  hide("moveEntryContainer");
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  show("listEntriesContainer");
}

function showArticleSummaryView() {
  hide("createListContainer");
  hide("updateListContainer");
  hide("listSelectionContainer");
  hide("listEntriesContainer");
  hide("moveEntryContainer");
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  show("articleSummaryContainer");
}

function showMoveEntryView() {
  hide("createListContainer");
  hide("updateListContainer");
  hide("listSelectionContainer");
  hide("listEntriesContainer");
  hide("articleSummaryContainer");
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  show("moveEntryContainer");
}

function showLoginPage(url, title) {
  let loginUrl = `${
    url.origin
  }/wiki/Special:UserLogin?returnto=${encodeURIComponent(title)}`;
  if (url.search) {
    loginUrl = loginUrl.concat(
      `&returntoquery=${encodeURIComponent(url.search.slice(1))}`
    );
  }
  browser.tabs.update({ url: loginUrl });
}

function showLoginPrompt(tab, url) {
  return geti18nMessages(url.origin, [
    MESSAGE_KEYS.loginPrompt,
    MESSAGE_KEYS.loginButtonText
  ]).then(messages =>
    getCanonicalPageTitle(tab).then(title => {
      hide("createListContainer");
      hide("updateListContainer");
      hide("moveEntryContainer");
      hide("listEntriesContainer");
      hide("articleSummaryContainer");
      hide("listSelectionContainer");
      document.getElementById("loginPromptText").textContent =
        messages[MESSAGE_KEYS.loginPrompt];
      document.getElementById("loginButton").textContent =
        messages[MESSAGE_KEYS.loginButtonText];
      document.getElementById("loginButton").onclick = () =>
        showLoginPage(url, title);
      show("loginPromptContainer");
    })
  );
}

function showListEntrySuccessMessage(tab, url, list, messageKey) {
  return geti18nMessages(url.origin, [messageKey]).then(messages =>
    getCanonicalPageTitle(tab).then(title => {
      hide("createListContainer");
      hide("updateListContainer");
      hide("moveEntryContainer");
      hide("listEntriesContainer");
      hide("articleSummaryContainer");
      hide("listSelectionContainer");
      const placeholder = "$1";
      const successTextContainer = document.getElementById("successText");
      const titleText = decodeURIComponent(title).replace(/_/g, " ");
      const titleElem = document.createElement("span");
      titleElem.className = "successTitle";
      titleElem.textContent = titleText;
      const listName = list && list.name ? `${list.name} list` : "reading list";
      let message = messages[messageKey];
      message = message.replace(/<[^>]+>/g, "");
      message = message
        .replace(/\[\[\$2\|\$3\]\]/g, listName)
        .replace("$2", listName)
        .replace("$3", listName);
      if (message.includes(placeholder)) {
        successTextContainer.textContent = message;
        const newTextNode = successTextContainer.firstChild.splitText(
          message.indexOf(placeholder)
        );
        newTextNode.deleteData(0, placeholder.length);
        successTextContainer.insertBefore(titleElem, newTextNode);
      } else {
        successTextContainer.textContent = message;
      }
      show("addToListSuccessContainer");
    })
  );
}

function showMoveEntrySuccessMessage(url, entry, targetList) {
  return geti18nMessages(url.origin, [MESSAGE_KEYS.moveSuccess]).then(messages => {
    hide("createListContainer");
    hide("updateListContainer");
    hide("moveEntryContainer");
    hide("listEntriesContainer");
    hide("articleSummaryContainer");
    hide("listSelectionContainer");
    const successTextContainer = document.getElementById("successText");
    const placeholder = "$1";
    const titleElem = document.createElement("span");
    titleElem.className = "successTitle";
    titleElem.textContent = normalizeArticleTitle(entry.title);
    const targetListName =
      targetList && targetList.name ? `${targetList.name} list` : "reading list";
    let message = messages[MESSAGE_KEYS.moveSuccess] || "$1 moved to $2";
    message = message.replace(/<[^>]+>/g, "").replace("$2", targetListName);
    if (message.includes(placeholder)) {
      successTextContainer.textContent = message;
      const newTextNode = successTextContainer.firstChild.splitText(
        message.indexOf(placeholder)
      );
      newTextNode.deleteData(0, placeholder.length);
      successTextContainer.insertBefore(titleElem, newTextNode);
    } else {
      successTextContainer.textContent = message;
    }
    show("addToListSuccessContainer");
  });
}

function showAddToListFailureMessage(url, res) {
  return geti18nMessages(url.origin, [
    MESSAGE_KEYS.enableSync,
    MESSAGE_KEYS.infoLinkText,
    MESSAGE_KEYS.listLimitExceeded,
    MESSAGE_KEYS.entryLimitExceeded,
    MESSAGE_KEYS.errorIntro
  ]).then(messages => {
    hide("createListContainer");
    hide("updateListContainer");
    hide("moveEntryContainer");
    hide("listEntriesContainer");
    hide("articleSummaryContainer");
    hide("listSelectionContainer");
    document.getElementById("failureBackButton").style.display = "inline-flex";
    document.getElementById("learnMoreLinkContainer").style.display = "none";
    let message;
    if (res.title === "readinglists-db-error-not-set-up") {
      message = messages[MESSAGE_KEYS.enableSync];
      const learnMoreLink = document.getElementById("learnMoreLink");
      learnMoreLink.textContent = messages[MESSAGE_KEYS.infoLinkText];
      learnMoreLink.onclick = () =>
        browser.tabs.create({ url: learnMoreLink.href });
      document.getElementById("learnMoreLinkContainer").style.display = "block";
    } else if (
      res.code === "readinglists-db-error-list-limit" ||
      res.title === "readinglists-db-error-list-limit"
    ) {
      message = messages[MESSAGE_KEYS.listLimitExceeded];
    } else if (res.title === "readinglists-db-error-entry-limit") {
      const maxEntries = getEntryLimitFromError(res);
      message = maxEntries
        ? messages[MESSAGE_KEYS.entryLimitExceeded].replace("$1", maxEntries)
        : "Article cannot be saved. You have reached the limit of articles per list.";
    } else {
      const detail = res.detail
        ? res.detail
        : res.title
          ? res.title
          : res.type
            ? res.type
            : typeof res === "object"
              ? JSON.stringify(res)
              : res;
      message = messages[MESSAGE_KEYS.errorIntro].replace("$1", detail);
    }
    document.getElementById("failureReason").textContent = message;
    show("addToListFailedContainer");
  });
}

function showUnsupportedPageMessage() {
  return getBundledMessage("en", [MESSAGE_KEYS.unsupportedPage]).then(messages => {
    hide("createListContainer");
    hide("updateListContainer");
    hide("listSelectionContainer");
    hide("listEntriesContainer");
    hide("articleSummaryContainer");
    hide("moveEntryContainer");
    hide("loginPromptContainer");
    hide("addToListSuccessContainer");
    document.getElementById("failureBackButton").style.display = "none";
    document.getElementById("learnMoreLinkContainer").style.display = "none";
    document.getElementById("failureReason").textContent =
      messages[MESSAGE_KEYS.unsupportedPage];
    show("addToListFailedContainer");
  });
}

function mobileToCanonicalHost(url) {
  url.hostname = url.hostname.replace(/^m\./, "").replace(".m.", ".");
  return url;
}

function getCreateEntryPostBody(listId, project, title, token) {
  return objToQueryString({
    list: encodeURIComponent(listId),
    project: encodeURIComponent(project),
    title: encodeURIComponent(title),
    token: encodeURIComponent(token)
  });
}

function getCreateEntryPostOptions(listId, project, title, token) {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    credentials: "same-origin",
    body: getCreateEntryPostBody(listId, project, title, token)
  };
}

function handleAddPageToListResult(tab, url, res, list) {
  if (res.id || (res.createentry && res.createentry.result === "Success")) {
    setSavedRowUiState(list.id, true);
    return showListEntrySuccessMessage(
      tab,
      url,
      list,
      MESSAGE_KEYS.addSuccess
    );
  }
  return showAddToListFailureMessage(url, res);
}

function getDeleteEntryPostBody(entryId, token) {
  return objToQueryString({
    entry: encodeURIComponent(entryId),
    token: encodeURIComponent(token)
  });
}

function getCreateListPostBody(name, description, token) {
  return objToQueryString({
    name: encodeURIComponent(name),
    description: encodeURIComponent(description || ""),
    token: encodeURIComponent(token)
  });
}

function getDeleteListPostBody(listId, token) {
  return objToQueryString({
    list: encodeURIComponent(listId),
    token: encodeURIComponent(token)
  });
}

function getUpdateListPostBody(listId, name, description, token) {
  return objToQueryString({
    list: encodeURIComponent(listId),
    name: encodeURIComponent(name),
    description: encodeURIComponent(description || ""),
    token: encodeURIComponent(token)
  });
}

function getDeleteEntryPostOptions(entryId, token) {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    credentials: "same-origin",
    body: getDeleteEntryPostBody(entryId, token)
  };
}

function deleteEntry(url, entryId, token) {
  return fetch(
    readingListDeleteEntryUrlForOrigin(url.origin),
    getDeleteEntryPostOptions(entryId, token)
  ).then(res => res.json());
}

function createReadingList(url, token, name, description) {
  return fetch(readingListCreateUrlForOrigin(url.origin), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    credentials: "same-origin",
    body: getCreateListPostBody(name, description, token)
  }).then(res => res.json());
}

function deleteReadingList(url, token, listId) {
  return fetch(readingListDeleteUrlForOrigin(url.origin), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    credentials: "same-origin",
    body: getDeleteListPostBody(listId, token)
  }).then(res => res.json());
}

function updateReadingList(url, token, listId, name, description) {
  return fetch(readingListUpdateUrlForOrigin(url.origin), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    credentials: "same-origin",
    body: getUpdateListPostBody(listId, name, description, token)
  }).then(res => res.json());
}

function getArticleSummary(entry) {
  return fetch(pageSummaryUrlForEntry(entry), {
    credentials: "same-origin"
  }).then(res => {
    if (!res.ok) {
      return res.json().then(data => {
        throw data;
      });
    }
    return res.json();
  });
}

function normalizeEntryTitle(title) {
  return decodeURIComponent(title || "")
    .replace(/ /g, "_")
    .trim();
}

function getReadingListEntriesPage(url, listId, rlecontinue) {
  return fetch(readingListEntriesUrlForOrigin(url.origin, listId, rlecontinue), {
    credentials: "same-origin"
  }).then(res => {
    if (res.status < 200 || res.status > 399) {
      return res.json().then(data => {
        throw data;
      });
    }
    return res.json();
  });
}

function getAllReadingListEntries(url, listId, rlecontinue, entries) {
  const combined = entries || [];
  return getReadingListEntriesPage(url, listId, rlecontinue).then(res => {
    const pageEntries =
      res && res.query && res.query.readinglistentries
        ? res.query.readinglistentries
        : [];
    const nextEntries = combined.concat(pageEntries);
    const nextContinue =
      res && res.continue && res.continue.rlecontinue
        ? res.continue.rlecontinue
        : null;
    if (nextContinue) {
      return getAllReadingListEntries(url, listId, nextContinue, nextEntries);
    }
    return nextEntries;
  });
}

function normalizeArticleTitle(title) {
  return decodeURIComponent(title || "").replace(/_/g, " ");
}

function buildArticleUrl(entry) {
  const project = entry && entry.project ? entry.project : "";
  const title = entry && entry.title ? entry.title.replace(/ /g, "_") : "";
  return `${project}/wiki/${encodeURIComponent(title)}`;
}

function setListEntriesLoading(isLoading) {
  document.getElementById("listEntriesLoading").style.display = isLoading
    ? "flex"
    : "none";
}

function setListEntriesStatus(text) {
  const status = document.getElementById("listEntriesStatus");
  if (text) {
    status.textContent = text;
    status.style.display = "block";
  } else {
    status.textContent = "";
    status.style.display = "none";
  }
}

function setListEntriesUiDisabled(disabled) {
  document.getElementById("listEntriesSearchInput").disabled = disabled;
  document.getElementById("moveEntrySearchInput").disabled = disabled;
  document
    .querySelectorAll(".articleButton, .articleActionButton, .moveTargetButton")
    .forEach(button => {
      button.disabled = disabled;
    });
}

function setMoveEntryStatus(text) {
  const status = document.getElementById("moveEntryStatus");
  if (text) {
    status.textContent = text;
    status.style.display = "block";
  } else {
    status.textContent = "";
    status.style.display = "none";
  }
}

function renderMoveEntryTargets() {
  const results = document.getElementById("moveEntryResults");
  const empty = document.getElementById("moveEntryEmpty");
  const filter = normalizeListName(
    document.getElementById("moveEntrySearchInput").value
  );
  results.textContent = "";
  const filtered = allReadingLists.filter(list => {
    if (!moveEntryContext || list.id === moveEntryContext.sourceList.id) return false;
    return normalizeListName(list.name).includes(filter);
  });

  if (!filtered.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  filtered.forEach(list => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "moveTargetButton";
    button.textContent = list.name;
    button.addEventListener("click", () => handleMoveEntryToList(list));
    item.appendChild(button);
    results.appendChild(item);
  });
}

function getFilteredListEntries() {
  const filter = normalizeListName(
    document.getElementById("listEntriesSearchInput").value
  );
  return currentListEntries.filter(entry =>
    normalizeListName(normalizeArticleTitle(entry.title)).includes(filter)
  );
}

function renderReadingListEntries(entries) {
  const results = document.getElementById("listEntriesResults");
  const empty = document.getElementById("listEntriesEmpty");
  results.textContent = "";

  if (!entries.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  entries.forEach(entry => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "articleRow";
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "listViewIconButton";
    viewButton.title = "View summary";
    viewButton.setAttribute("aria-label", `View summary for ${normalizeArticleTitle(entry.title)}`);
    const viewIcon = document.createElement("span");
    viewIcon.className = "listViewIcon";
    viewButton.appendChild(viewIcon);
    viewButton.addEventListener("click", event => {
      event.stopPropagation();
      handleArticleSummarySelection(entry);
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "articleButton";
    button.textContent = normalizeArticleTitle(entry.title);
    button.addEventListener("click", () =>
      browser.tabs.create({ url: buildArticleUrl(entry), active: false })
    );
    const actions = document.createElement("span");
    actions.className = "articleActions";

    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.className = "articleActionButton";
    moveButton.title = "Move to another list";
    moveButton.setAttribute("aria-label", "Move to another list");
    const moveIcon = document.createElement("span");
    moveIcon.className = "moveArticleIcon";
    moveButton.appendChild(moveIcon);
    moveButton.addEventListener("click", event => {
      event.stopPropagation();
      handleMoveEntrySelection(entry);
    });
    actions.appendChild(moveButton);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "articleActionButton";
    removeButton.title = "Remove from this list";
    removeButton.setAttribute("aria-label", "Remove from this list");
    const removeIcon = document.createElement("span");
    removeIcon.className = "listSavedIcon";
    removeButton.appendChild(removeIcon);
    removeButton.addEventListener("click", event => {
      event.stopPropagation();
      handleViewedListEntryRemoval(entry);
    });
    actions.appendChild(removeButton);

    row.appendChild(viewButton);
    row.appendChild(button);
    row.appendChild(actions);
    item.appendChild(row);
    results.appendChild(item);
  });
}

function handleListViewSelection(list) {
  if (!listSelectionContext) return;
  currentViewedList = list;
  document.getElementById("listEntriesTitle").textContent = list.name;
  document.getElementById("listEntriesSearchInput").value = "";
  document.getElementById("listEntriesResults").textContent = "";
  hide("listEntriesEmpty");
  setListEntriesStatus("");
  setListEntriesLoading(true);
  showListEntriesView();

  return getAllReadingListEntries(listSelectionContext.url, list.id)
    .then(entries => {
      currentListEntries = entries;
      renderReadingListEntries(getFilteredListEntries());
    })
    .catch(err => {
      currentListEntries = [];
      setListEntriesStatus(
        err && err.detail ? err.detail : "Unable to load articles for this list."
      );
    })
    .finally(() => {
      setListEntriesLoading(false);
    });
}

function handleMoveEntrySelection(entry) {
  if (!currentViewedList) return;
  moveEntryContext = { entry, sourceList: currentViewedList };
  document.getElementById("moveEntryTitle").textContent = `Move: ${normalizeArticleTitle(
    entry.title
  )}`;
  document.getElementById("moveEntrySearchInput").value = "";
  setMoveEntryStatus("");
  hide("moveEntryEmpty");
  renderMoveEntryTargets();
  showMoveEntryView();
}

function renderArticleSummary(summary, fallbackEntry) {
  const body = document.getElementById("articleSummaryBody");
  const title = summary && summary.title
    ? summary.title
    : normalizeArticleTitle(fallbackEntry.title);
  document.getElementById("articleSummaryTitle").textContent = title;
  body.innerHTML = "";

  if (summary && summary.extract_html) {
    const paragraph = document.createElement("p");
    paragraph.className = "articleSummaryText";
    paragraph.innerHTML = summary.extract_html;
    body.appendChild(paragraph);
  } else {
    const empty = document.createElement("p");
    empty.className = "articleSummaryText";
    empty.textContent = "No summary is available for this article.";
    body.appendChild(empty);
  }
}

function handleArticleSummarySelection(entry) {
  currentSummaryEntry = entry;
  document.getElementById("articleSummaryTitle").textContent =
    normalizeArticleTitle(entry.title);
  document.getElementById("articleSummaryBody").textContent = "";
  setArticleSummaryStatus("");
  setArticleSummaryLoading(true);
  showArticleSummaryView();

  return getArticleSummary(entry)
    .then(summary => {
      renderArticleSummary(summary, entry);
    })
    .catch(err => {
      const message =
        err && err.detail
          ? err.detail
          : "Unable to load a summary for this article.";
      setArticleSummaryStatus(message);
      renderArticleSummary(null, entry);
    })
    .finally(() => {
      setArticleSummaryLoading(false);
    });
}

function findMatchingEntryId(url, listId, title) {
  const normalizedTitle = normalizeEntryTitle(title);
  const project = getProjectOrigin(url);
  return getAllReadingListEntries(url, listId).then(entries => {
    const matchingEntry = entries.find(entry => {
      return (
        entry.project === project &&
        normalizeEntryTitle(entry.title) === normalizedTitle
      );
    });
    if (!matchingEntry || typeof matchingEntry.id === "undefined") {
      throw new Error("Page is not saved in this reading list.");
    }
    return matchingEntry.id;
  });
}

function addEntryToList(url, listId, token, entry) {
  return fetch(
    readingListCreateEntryUrlForOrigin(url.origin),
    getCreateEntryPostOptions(
      listId,
      entry.project,
      normalizeEntryTitle(entry.title),
      token
    )
  ).then(res => res.json());
}

function removeEntryFromList(url, token, entry, list) {
  return deleteEntry(url, entry.id, token).then(res => {
    if (res && res.error) {
      throw res.error;
    }
    currentListEntries = currentListEntries.filter(
      currentEntry => currentEntry.id !== entry.id
    );
    updateListSize(list.id, -1);
    renderReadingListEntries(getFilteredListEntries());
    return refreshSavedListStatuses().then(() => res);
  });
}

function handleViewedListEntryRemoval(entry) {
  if (!listSelectionContext || !currentViewedList) return;
  setListEntriesUiDisabled(true);
  setListEntriesStatus(`Removing "${normalizeArticleTitle(entry.title)}"...`);
  return removeEntryFromList(
    listSelectionContext.url,
    listSelectionContext.token,
    entry,
    currentViewedList
  )
    .then(() => {
      setListEntriesStatus(`Removed "${normalizeArticleTitle(entry.title)}".`);
    })
    .catch(err => {
      setListEntriesStatus("");
      return showAddToListFailureMessage(listSelectionContext.url, err);
    })
    .finally(() => {
      setListEntriesUiDisabled(false);
    });
}

function handleMoveEntryToList(targetList) {
  if (!listSelectionContext || !moveEntryContext) return;
  const { entry, sourceList } = moveEntryContext;
  setListEntriesUiDisabled(true);
  setMoveEntryStatus(`Moving to "${targetList.name}"...`);
  return addEntryToList(
    listSelectionContext.url,
    targetList.id,
    listSelectionContext.token,
    entry
  )
    .then(res => {
      if (!res || (!res.id && !(res.createentry && res.createentry.result === "Success"))) {
        throw res;
      }
      return removeEntryFromList(
        listSelectionContext.url,
        listSelectionContext.token,
        entry,
        sourceList
      ).then(() => {
        updateListSize(targetList.id, 1);
        moveEntryContext = null;
        return showMoveEntrySuccessMessage(
          listSelectionContext.url,
          entry,
          targetList
        );
      });
    })
    .catch(err => showAddToListFailureMessage(listSelectionContext.url, err))
    .finally(() => {
      setListEntriesUiDisabled(false);
      setMoveEntryStatus("");
    });
}

function sortReadingLists(lists) {
  return lists.sort((a, b) => {
    if (a.default === b.default) return 0;
    return a.default ? -1 : 1;
  });
}

function reloadReadingLists(statusText) {
  if (!listSelectionContext) return Promise.resolve();
  hide("listEmpty");
  return getAllReadingLists(listSelectionContext.url)
    .then(lists => {
      allReadingLists = sortReadingLists(lists);
      renderReadingLists();
      return refreshSavedListStatuses();
    })
    .then(() => {
      if (statusText) {
        setListStatus(statusText);
      }
    });
}

function handleCreateReadingList() {
  if (!listSelectionContext) return;
  const nameInput = document.getElementById("createListNameInput");
  const descriptionInput = document.getElementById("createListDescriptionInput");
  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();
  if (!name) {
    setCreateListStatus("A name is required.");
    return;
  }

  document.getElementById("createListSubmitButton").disabled = true;
  setCreateListStatus(`Creating "${name}"...`);
  return createReadingList(
    listSelectionContext.url,
    listSelectionContext.token,
    name,
    description
  )
    .then(res => {
      if (res && res.error) {
        throw res.error;
      }
      nameInput.value = "";
      descriptionInput.value = "";
      showListSelection();
      return reloadReadingLists(`Created "${name}".`);
    })
    .catch(err => {
      setCreateListStatus("");
      return showAddToListFailureMessage(listSelectionContext.url, err);
    })
    .finally(() => {
      document.getElementById("createListSubmitButton").disabled = false;
    });
}

function handleReadingListDeletion(list) {
  if (!listSelectionContext) return;
  const confirmed = window.confirm(`Delete "${list.name}"?`);
  if (!confirmed) {
    return;
  }

  setListUiDisabled(true);
  setListStatus(`Deleting "${list.name}"...`);
  return deleteReadingList(listSelectionContext.url, listSelectionContext.token, list.id)
    .then(res => {
      if (res && res.error) {
        throw res.error;
      }
      if (currentViewedList && currentViewedList.id === list.id) {
        currentViewedList = null;
        currentListEntries = [];
      }
      if (currentSummaryEntry && currentViewedList && currentViewedList.id === list.id) {
        currentSummaryEntry = null;
      }
      setDeleteMode(false);
      return reloadReadingLists(`Deleted "${list.name}".`);
    })
    .catch(err => {
      setDeleteMode(false);
      return showAddToListFailureMessage(listSelectionContext.url, err);
    })
    .finally(() => {
      setListUiDisabled(false);
    });
}

function handleReadingListUpdateSelection(list) {
  currentUpdatingList = list;
  document.getElementById("updateListNameInput").value = list.name || "";
  document.getElementById("updateListDescriptionInput").value =
    list.description || "";
  setUpdateMode(false);
  showUpdateListView();
}

function handleReadingListUpdate() {
  if (!listSelectionContext || !currentUpdatingList) return;
  const name = document.getElementById("updateListNameInput").value.trim();
  const description = document
    .getElementById("updateListDescriptionInput")
    .value.trim();
  if (!name) {
    setUpdateListStatus("A name is required.");
    return;
  }

  document.getElementById("updateListSubmitButton").disabled = true;
  setUpdateListStatus(`Updating "${currentUpdatingList.name}"...`);
  return updateReadingList(
    listSelectionContext.url,
    listSelectionContext.token,
    currentUpdatingList.id,
    name,
    description
  )
    .then(res => {
      if (res && res.error) {
        throw res.error;
      }
      const previousName = currentUpdatingList.name;
      currentUpdatingList = null;
      showListSelection();
      return reloadReadingLists(`Updated "${previousName}".`);
    })
    .catch(err => {
      setUpdateListStatus("");
      return showAddToListFailureMessage(listSelectionContext.url, err);
    })
    .finally(() => {
      document.getElementById("updateListSubmitButton").disabled = false;
    });
}

function exportReadingListsData(lists) {
  if (!listSelectionContext) return Promise.resolve();
  setListUiDisabled(true);
  setListStatus("Exporting reading lists...");
  return Promise.all(
    lists.map(list =>
      getAllReadingListEntries(listSelectionContext.url, list.id).then(entries => ({
        name: list.name,
        description: list.description || "",
        pages: entries.map(entry => ({
          title: entry.title,
          lang: getEntryLang(entry)
        }))
      }))
    )
  )
    .then(exportedLists => {
      downloadJsonFile("Wikipedia reading lists (Saved and more).json", {
        readingListsV1: exportedLists
      });
      setListStatus("Reading lists exported.");
    })
    .catch(err => showAddToListFailureMessage(listSelectionContext.url, err))
    .finally(() => {
      setListUiDisabled(false);
    });
}

function exportCurrentReadingList() {
  if (!currentViewedList) return;
  setListEntriesUiDisabled(true);
  setListEntriesStatus(`Exporting "${currentViewedList.name}"...`);
  return getAllReadingListEntries(listSelectionContext.url, currentViewedList.id)
    .then(entries => {
      currentListEntries = entries;
      renderReadingListEntries(getFilteredListEntries());
      downloadJsonFile(
        `${sanitizeExportFilename(currentViewedList.name)} (Wikipedia reading lists).json`,
        {
          readingListsV1: [
            {
              name: currentViewedList.name,
              description: currentViewedList.description || "",
              pages: entries.map(entry => ({
                title: entry.title,
                lang: getEntryLang(entry)
              }))
            }
          ]
        }
      );
      setListEntriesStatus(`Exported "${currentViewedList.name}".`);
    })
    .catch(err => showAddToListFailureMessage(listSelectionContext.url, err))
    .finally(() => {
      setListEntriesUiDisabled(false);
    });
}

function handleRemovePageFromListResult(tab, url, res, list) {
  if (!res || !res.error) {
    setSavedRowUiState(list.id, false);
    return showListEntrySuccessMessage(
      tab,
      url,
      list,
      MESSAGE_KEYS.removeSuccess
    );
  }
  return showAddToListFailureMessage(url, res.error || res);
}

function removePageFromList(tab, url, listId, token, list) {
  return getCanonicalPageTitle(tab)
    .then(title =>
      findMatchingEntryId(url, listId, title).then(entryId =>
        fetch(
          readingListDeleteEntryUrlForOrigin(url.origin),
          getDeleteEntryPostOptions(entryId, token)
        )
      )
    )
    .then(res => res.json())
    .then(res => handleRemovePageFromListResult(tab, url, res, list));
}

function getCanonicalPageTitle(tab) {
  return browser.tabs
    .sendMessage(tab.id, { type: "wikiExtensionGetPageTitle" })
    .then(res => parseTitleFromUrl(res.href))
    .catch(() => parseTitleFromUrl(tab.url));
}

function addPageToList(tab, url, listId, token, list) {
  return getCanonicalPageTitle(tab)
    .then(title =>
      fetch(
        readingListCreateEntryUrlForOrigin(url.origin),
        getCreateEntryPostOptions(
          listId,
          mobileToCanonicalHost(url).origin,
          title,
          token
        )
      )
    )
    .then(res => res.json())
    .then(res => handleAddPageToListResult(tab, url, res, list));
}

function handleListSelection(list) {
  if (!listSelectionContext) return;
  setListUiDisabled(true);
  setListStatus(`Saving to "${list.name}"...`);
  return addPageToList(
    listSelectionContext.tab,
    listSelectionContext.url,
    list.id,
    listSelectionContext.token,
    list
  )
    .catch(err => showAddToListFailureMessage(listSelectionContext.url, err))
    .finally(() => {
      setListUiDisabled(false);
      setListStatus("");
    });
}

function handleSavedListRemoval(list) {
  if (!listSelectionContext) return;
  setListUiDisabled(true);
  setListStatus(`Removing from "${list.name}"...`);
  return removePageFromList(
    listSelectionContext.tab,
    listSelectionContext.url,
    list.id,
    listSelectionContext.token,
    list
  )
    .catch(err => showAddToListFailureMessage(listSelectionContext.url, err))
    .finally(() => {
      setListUiDisabled(false);
      setListStatus("");
    });
}

function getProjectOrigin(url) {
  return mobileToCanonicalHost(new URL(url.href)).origin;
}

function getListsContainingEntry(url, title) {
  return fetch(
    readingListEntryLookupUrlForOrigin(
      url.origin,
      title,
      getProjectOrigin(url)
    ),
    { credentials: "same-origin" }
  )
    .then(res => {
      if (!res.ok) return new Set();
      return res.json().then(data => {
        const lists =
          data && data.query && data.query.readinglists
            ? data.query.readinglists
            : [];
        return new Set(lists.map(list => list.id));
      });
    })
    .catch(() => new Set());
}

function markListsWithEntryStatus(tab, url, lists) {
  return getCanonicalPageTitle(tab)
    .then(title => getListsContainingEntry(url, title))
    .then(savedListIds =>
      lists.map(list =>
        Object.assign({}, list, { hasEntry: savedListIds.has(list.id) })
      )
    );
}

function handleTokenResult(tab, url, token) {
  if (token === "+\\") {
    return showLoginPrompt(tab, url);
  }

  listSelectionContext = { tab, url, token };
  setDeleteMode(false);
  setUpdateMode(false);
  showListSelection();
  setListLoading(true);
  setListStatus("");
  setListUiDisabled(true);
  hide("listEmpty");
  document.getElementById("listResults").textContent = "";

  return getAllReadingLists(url)
    .then(lists => {
      allReadingLists = sortReadingLists(lists);
      setListLoading(false);
      renderReadingLists();
      setListUiDisabled(false);
      document.getElementById("listSearchInput").value = "";
      setListStatus("Checking saved status...");
      return markListsWithEntryStatus(tab, url, allReadingLists)
        .then(updatedLists => {
          allReadingLists = updatedLists;
          renderReadingLists();
        })
        .catch(() => {})
        .finally(() => {
          setListStatus("");
        });
    })
    .catch(err => {
      setListLoading(false);
      setListUiDisabled(false);
      return showAddToListFailureMessage(url, err);
    });
}

function handleClick(tab, url) {
  return getCsrfToken(url.origin).then(token =>
    handleTokenResult(tab, url, token)
  );
}

function isSupportedPage(tab) {
  if (!tab || !tab.url) {
    return Promise.resolve(false);
  }

  const url = new URL(tab.url);
  if (!isSupportedHost(url.hostname) || !isSavablePage(url.pathname, url.searchParams)) {
    return Promise.resolve(false);
  }

  return browser.tabs
    .sendMessage(tab.id, { type: "wikiExtensionGetPageNamespace" })
    .then(res => Boolean(res) && isSupportedNamespace(res.ns))
    .catch(() => false);
}

document
  .getElementById("listSearchInput")
  .addEventListener("input", renderReadingLists);
document
  .getElementById("exportReadingListsButton")
  .addEventListener("click", () => exportReadingListsData(allReadingLists));
document
  .getElementById("createReadingListButton")
  .addEventListener("click", showCreateListView);
document
  .getElementById("updateReadingListButton")
  .addEventListener("click", () => setUpdateMode(!isUpdateMode));
document
  .getElementById("deleteReadingListButton")
  .addEventListener("click", () => setDeleteMode(!isDeleteMode));
document
  .getElementById("createListBackButton")
  .addEventListener("click", showListSelection);
document
  .getElementById("updateListBackButton")
  .addEventListener("click", showListSelection);
document
  .getElementById("createListSubmitButton")
  .addEventListener("click", handleCreateReadingList);
document
  .getElementById("updateListSubmitButton")
  .addEventListener("click", handleReadingListUpdate);
document
  .getElementById("listEntriesSearchInput")
  .addEventListener("input", () =>
    renderReadingListEntries(getFilteredListEntries())
  );
document
  .getElementById("moveEntrySearchInput")
  .addEventListener("input", renderMoveEntryTargets);
document
  .getElementById("listEntriesBackButton")
  .addEventListener("click", showListSelection);
document
  .getElementById("exportListEntriesButton")
  .addEventListener("click", exportCurrentReadingList);
document
  .getElementById("articleSummaryBackButton")
  .addEventListener("click", showListEntriesView);
document
  .getElementById("moveEntryBackButton")
  .addEventListener("click", showListEntriesView);
document
  .getElementById("successBackButton")
  .addEventListener("click", showListSelection);
document
  .getElementById("failureBackButton")
  .addEventListener("click", showListSelection);

getCurrentTab().then(tab => {
  const url = new URL(tab.url);
  return isSupportedPage(tab).then(isSupported => {
    if (!isSupported) {
      return showUnsupportedPageMessage();
    }
    return handleClick(tab, url).catch(err =>
      showAddToListFailureMessage(url, err)
    );
  });
});
