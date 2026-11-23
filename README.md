# webextension-readinglists

A [WebExtension](https://wiki.mozilla.org/WebExtensions) for users of synchronized reading lists to add a Wikimedia wiki page from the browser.

Adds a page action on supported Wikimedia projects to add the current page to the default reading list for the logged in user.

Compatible with both Firefox and Chromium/Google Chrome courtesy of [webextension-polyfill](https://github.com/mozilla/webextension-polyfill).

See debug installation instructions for [Firefox](https://developer.mozilla.org/en-US/docs/Tools/about%3Adebugging) and [Chrome](https://developer.chrome.com/extensions/getstarted).

## Internationalization

The extension uses the browser's UI language and WebExtension message catalogs
in `extension/_locales`. English is the default and fallback locale. Add new
languages as `_locales/<locale>/messages.json`, preserving message keys and
substitution placeholders. UI message translations are bundled with the
extension; article content and summaries remain in the source wiki's language.
Plural messages use `Intl.PluralRules` category suffixes (for example `_one`
and `_other`); translations may add the categories used by their locale.

Run `npm test` to validate the message catalogs and their references.

## issues

Please file bugs or feature requests on Phabricator, Wikimedia's issue tracking software. ([link](https://phabricator.wikimedia.org/maniphest/task/edit/form/10/?title=&projects=reading-infrastructure-team-backlog))
