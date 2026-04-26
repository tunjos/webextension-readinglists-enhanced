const MESSAGE_KEYS = {
  enableSync: "readinglists-browser-enable-sync-prompt",
  entryLimitExceeded: "readinglists-browser-list-entry-limit-exceeded",
  errorIntro: "readinglists-browser-error-intro",
  infoLinkText: "readinglists-browser-extension-info-link-text",
  loginButtonText: "login",
  loginPrompt: "readinglists-browser-login-prompt",
  addSuccess: "readinglists-browser-add-entry-success",
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

function readingListPostEntryUrlForOrigin(origin, listId, token) {
  return `${origin}/api/rest_v1/data/lists/${listId}/entries/?csrf_token=${encodeURIComponent(
    token
  )}`;
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
    ? "block"
    : "none";
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "listButton";
    button.dataset.listId = list.id;

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

    if (list.hasEntry) {
      button.addEventListener("click", () => {});
    } else {
      button.addEventListener("click", () => handleListSelection(list));
    }
    listRow.appendChild(button);
    listRow.appendChild(meta);
    listItem.appendChild(listRow);
    listResults.appendChild(listItem);
  });
}

function setListUiDisabled(disabled) {
  document.getElementById("listSearchInput").disabled = disabled;
  document
    .querySelectorAll(".listButton, .listSavedIconButton")
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

function showListSelection() {
  hide("loginPromptContainer");
  hide("addToListSuccessContainer");
  hide("addToListFailedContainer");
  show("listSelectionContainer");
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
      hide("listSelectionContainer");
      const placeholder = "$1";
      const successTextContainer = document.getElementById("successText");
      const titleText = decodeURIComponent(title).replace(/_/g, " ");
      const titleElem = document.createElement("span");
      titleElem.className = "successTitle";
      titleElem.textContent = titleText;
      const listName = list && list.name ? list.name : "reading list";
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

function showAddToListFailureMessage(url, res) {
  return geti18nMessages(url.origin, [
    MESSAGE_KEYS.enableSync,
    MESSAGE_KEYS.infoLinkText,
    MESSAGE_KEYS.entryLimitExceeded,
    MESSAGE_KEYS.errorIntro
  ]).then(messages => {
    hide("listSelectionContainer");
    let message;
    if (res.title === "readinglists-db-error-not-set-up") {
      message = messages[MESSAGE_KEYS.enableSync];
      const learnMoreLink = document.getElementById("learnMoreLink");
      learnMoreLink.textContent = messages[MESSAGE_KEYS.infoLinkText];
      learnMoreLink.onclick = () =>
        browser.tabs.create({ url: learnMoreLink.href });
      document.getElementById("learnMoreLinkContainer").style.display = "block";
    } else if (res.title === "readinglists-db-error-entry-limit") {
      const maxEntries =
        si.query.general["readinglists-config"].maxEntriesPerList;
      message = messages[MESSAGE_KEYS.entryLimitExceeded].replace(
        "$1",
        maxEntries.toString()
      );
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
    hide("listSelectionContainer");
    hide("loginPromptContainer");
    hide("addToListSuccessContainer");
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

function getAddToListPostBody(url, title) {
  return JSON.stringify({
    project: mobileToCanonicalHost(url).origin,
    title
  });
}

function getAddToListPostOptions(url, title) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: getAddToListPostBody(url, title)
  };
}

function handleAddPageToListResult(tab, url, res, list) {
  if (res.id) {
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

function getDeleteEntryPostOptions(entryId, token) {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    credentials: "same-origin",
    body: getDeleteEntryPostBody(entryId, token)
  };
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
        readingListPostEntryUrlForOrigin(url.origin, listId, token),
        getAddToListPostOptions(url, title)
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
  showListSelection();
  setListLoading(true);
  setListStatus("");
  setListUiDisabled(true);
  hide("listEmpty");
  document.getElementById("listResults").textContent = "";

  return getAllReadingLists(url)
    .then(lists => {
      allReadingLists = lists.sort((a, b) => {
        if (a.default === b.default) return 0;
        return a.default ? -1 : 1;
      });
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
