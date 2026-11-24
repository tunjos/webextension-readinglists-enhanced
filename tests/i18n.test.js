const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const locales = path.join(root, "_locales");
const english = JSON.parse(fs.readFileSync(path.join(locales, "en", "messages.json"), "utf8"));

function placeholders(message) {
  return (message.match(/\$[1-9]/g) || []).sort();
}

function popupFunctions(names, globals = {}) {
  const source = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  const definitions = names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1);
    return source.slice(start, source.indexOf("\n}", start) + 2);
  });
  return require("node:vm").runInNewContext(
    definitions.join("\n") + `\n({${names.join(",")}})`, globals
  );
}

test("article titles decode once at the URL boundary, never during display or matching", () => {
  const { parseTitleFromUrl, normalizeArticleTitle, normalizeEntryTitle } = popupFunctions(
    ["parseTitleFromUrl", "normalizeArticleTitle", "normalizeEntryTitle"], { URL }
  );
  for (const route of ["/wiki/", "/w/index.php?title="]) {
    const title = parseTitleFromUrl("https://en.wikipedia.org" + route + "100%25_%2520");
    assert.equal(title, "100%_%20");
    assert.equal(normalizeArticleTitle(title), "100% %20");
    assert.equal(normalizeEntryTitle("100% %20"), title);
  }
});

test("success messages emphasize literal names in the translation's order", () => {
  let nodes;
  const { renderEntrySuccess } = popupFunctions(["normalizeArticleTitle", "renderEntrySuccess"], {
    hide() {}, show() {}, setUtilityBarHidden() {},
    msg: () => "List $2: $1",
    document: {
      createElement: tag => ({ tag }),
      getElementById: () => ({ replaceChildren(...children) { nodes = children; } })
    }
  });
  renderEntrySuccess("moveSuccess", "100%_<$2>", { name: "A$&B $1" });
  assert.deepEqual(nodes, ["List ", { tag: "strong", textContent: "A$&B $1" }, ": ",
    { tag: "strong", textContent: "100% <$2>" }, ""]);
});

test("flat and wrapped Action API entry-limit errors use localized messages", async () => {
  const reason = {};
  const { showAddToListFailureMessage } = popupFunctions(["getEntryLimitFromError", "showAddToListFailureMessage"], {
    hide() {}, show() {}, setUtilityBarHidden() {}, listOverviewReady: true,
    MESSAGE_KEYS: {}, geti18nMessages: async () => ({}),
    pluralMsg: (key, count) => key + ":" + count, msg: key => key,
    document: { getElementById: id => id === "failureReason" ? reason : { style: {} } }
  });
  const code = "readinglists-db-error-entry-limit";
  for (const response of [{ code }, { error: { code, info: "Limit: 500" } }]) {
    await showAddToListFailureMessage(new URL("https://en.wikipedia.org"), response);
    assert.equal(reason.textContent, response.error ? "entryLimitExceeded:500" : "entryLimitUnknown");
  }
});

test("manifest locale and message references exist", () => {
  assert.equal(manifest.default_locale, "en");
  const refs = JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g);
  for (const [, key] of refs) assert.ok(english[key], `missing manifest message: ${key}`);
});

test("literal message references exist in the English catalog", () => {
  for (const file of ["popup.js", "background.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const refs = source.matchAll(/(?:msg|getMessage|setExportMessage)\(\s*(?:job,\s*)?["']([^"']+)["']/g);
    for (const [, key] of refs) {
      if (!key.startsWith("@@")) assert.ok(english[key], `${file}: missing ${key}`);
    }
  }
});

test("catalogs contain valid messages and preserve English placeholders", () => {
  for (const locale of fs.readdirSync(locales)) {
    const file = path.join(locales, locale, "messages.json");
    const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const key of Object.keys(english)) {
      assert.ok(Object.hasOwn(catalog, key), `${locale}: missing message ${key}`);
    }
    for (const [key, value] of Object.entries(catalog)) {
      assert.match(key, /^[A-Za-z0-9_]+$/, `${locale}: invalid key ${key}`);
      assert.equal(typeof value.message, "string", `${locale}: invalid message ${key}`);
      assert.ok(value.message.trim(), `${locale}: empty message ${key}`);
      const source = english[key] || english[key.replace(/_(zero|one|two|few|many)$/, "_other")];
      assert.ok(source, `${locale}: unknown message ${key}`);
      assert.deepEqual(placeholders(value.message), placeholders(source.message), `${locale}: placeholders for ${key}`);
    }
  }
});

test("popup static localization resolves every message and preserves tutorial elements", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  const start = source.indexOf("function localizePopup() {");
  const end = source.indexOf("\nlocalizePopup();", start);
  assert.ok(start >= 0 && end > start);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { setAttribute(name, value) { this[name] = value; } });
    return elements.get(id);
  };
  const tutorialItems = Array.from({ length: 7 }, () => {
    const heading = {};
    return { lastChild: {}, querySelector: () => heading, heading };
  });
  const document = {
    documentElement: {},
    getElementById: element,
    querySelector: element,
    querySelectorAll(selector) {
      return selector === ".tutorialItem > div" ? tutorialItems : [element("back")];
    }
  };
  const browser = { i18n: {
    getMessage(key) {
      if (key === "@@bidi_dir") return "ltr";
      assert.ok(english[key], `missing popup message: ${key}`);
      return english[key].message;
    },
    getUILanguage: () => "en-US"
  } };
  vm.runInNewContext(`${source.slice(start, end)}\nlocalizePopup();`, { browser, document });
  assert.equal(element("listIntro").textContent, english.chooseList.message);
  assert.equal(element("exportReadingListsButton")["aria-label"], english.exportLists.message);
  assert.equal(tutorialItems[0].heading.textContent, english.viewList.message);
  assert.equal(tutorialItems[0].lastChild.textContent, english.tutorialViewList.message);
});

test("plural messages select the locale category and fall back to other", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  const start = source.indexOf("function pluralMsg(");
  const end = source.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  for (const [locale, count, category] of [
    ["en", 1, "one"], ["en", 2, "other"], ["ar", 0, "zero"],
    ["ar", 2, "two"], ["ar", 11, "many"], ["ro", 3, "few"]
  ]) {
    const catalog = JSON.parse(fs.readFileSync(path.join(locales, locale, "messages.json"), "utf8"));
    const calls = [];
    const browser = { i18n: { getUILanguage: () => locale } };
    const msg = (key, n) => {
      calls.push(key);
      return catalog[key]?.message.replace("$1", n) || "";
    };
    const plural = vm.runInNewContext(`${source.slice(start, end)}\npluralMsg`, { browser, Intl, msg });
    const key = `entryLimitExceeded_${category}`;
    const expected = catalog[key] ? [key] : [key, "entryLimitExceeded_other"];
    assert.equal(plural("entryLimitExceeded", count), catalog[expected.at(-1)].message.replace("$1", String(count)));
    assert.deepEqual(calls, expected, `${locale}: plural lookup for ${count}`);
  }
});
