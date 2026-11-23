const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const locales = path.join(root, "_locales");
const english = JSON.parse(fs.readFileSync(path.join(locales, "en", "messages.json"), "utf8"));

function placeholders(message) {
  return [...new Set(message.match(/\$[1-9]/g) || [])].sort();
}

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
    if (!fs.existsSync(file)) continue;
    const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(catalog)) {
      assert.match(key, /^[A-Za-z0-9_]+$/, `${locale}: invalid key ${key}`);
      assert.equal(typeof value.message, "string", `${locale}: invalid message ${key}`);
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
  const browser = { i18n: { getUILanguage: () => "en" } };
  const context = { browser, Intl, msg: (key, count) => english[key]?.message.replace("$1", count) || "" };
  const plural = vm.runInNewContext(`${source.slice(start, end)}\npluralMsg`, context);
  assert.match(plural("entryLimitExceeded", 1), /1 article per list/);
  assert.match(plural("entryLimitExceeded", 2), /2 articles per list/);
});
