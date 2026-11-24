# Extension locale support

## Translation progress

Six translations cover all 99 English source messages. Coverage is the number
of English message keys with a non-empty value in the locale's catalog.

| Locale | Language | Coverage | Browser verification | Fluent-speaker review |
| --- | --- | --- | --- | --- |
| `en` | English | 99/99 (source) | Source baseline | N/A |
| `ar` | Arabic | 99/99 | Desktop Edge visual check with right-to-left text and mixed-script sample data | Pending |
| `de` | German | 99/99 | Desktop Edge visual check with sample data | Pending |
| `es` | Spanish | 99/99 | Desktop Edge visual check with sample data | Pending |
| `fr` | French | 99/99 | Desktop Edge visual check with sample data | Pending |
| `it` | Italian | 99/99 | Maintainer confirmed a local test. Browser unspecified. | Pending |
| `pt_BR` | Brazilian Portuguese | 99/99 | Desktop Edge visual check with sample data | Pending |

Update the coverage counts when the English catalog changes or a translation
is added. Run `npm test` to validate catalog keys and placeholders, and record
browser checks and fluent-speaker reviews as they happen.

## Browser support

Sources checked on November 23, 2026. The locale matrix contains 181 locale codes
from the union of these four published lists. Codes use hyphens in the table.
Use underscores for regional WebExtension catalog directories, such as
`_locales/pt_BR/messages.json`, and verify variant codes on the target browser.

| Column | What a check mark means |
| --- | --- |
| Chrome | Listed in Google's public [Chrome extension locale table](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales). |
| Edge | Listed as a Microsoft Edge [display language](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-supported-languages#supported-display-languages). `Win` marks entries Microsoft excludes on macOS. Microsoft documents [extension i18n support](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support), and its display-language list is the basis for this column. |
| Firefox desktop | Listed in Mozilla's [shipped desktop locales](https://github.com/mozilla-firefox/firefox/blob/main/browser/locales/shipped-locales). |
| Firefox Android | Listed in Mozilla's [Fenix localization configuration](https://github.com/mozilla-l10n/android-l10n/blob/main/mozilla-mobile/fenix/l10n.toml), plus the source locale `en-US`. Availability can vary by release and device. |

These lists describe different kinds of support. Chromium can recognize more
extension catalogs than Google's published table, and Firefox extensions can
supply catalogs beyond the browser's shipped locales. The table records exact
matches to the identified lists and remains a planning reference for locales
outside them. Store listing languages are governed separately.
[Chromium locale implementation](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/extension_l10n_util.cc) ·
[Mozilla locale negotiation](https://firefox-source-docs.mozilla.org/intl/locale.html)

## Fallbacks

- `✓` means the exact code is listed in that column's source. A check mark says
  nothing about which catalogs this extension currently bundles.
- `fr` → `en` means that generic French is a candidate for sharing a translation,
  followed by the extension's English fallback. These are catalog planning
  suggestions. A browser may select an available parent locale automatically,
  but suggestions such as `nb-NO` → `no` and `zh-HK` → `zh-TW` may need a
  catalog alias or browser-specific packaging. Test the effective locale before
  relying on such a mapping.
- `en` alone means English is the fallback listed for this extension. A check
  mark also falls back to `en` when no matching catalog supplies the message.
  See [translation progress](#translation-progress) for bundled locales.
- At runtime the extension delegates lookup to the browser. Chrome documents
  lookup through the preferred locale, its base locale where applicable, and
  the manifest default. Firefox uses its locale negotiation and the extension
  default. For example, a missing British English message can fall back to
  `en`, while Canadian French can use `fr` when the browser selects it and
  the package supplies it.
  [Chrome message lookup](https://developer.chrome.com/docs/extensions/reference/api/i18n#searching-for-messages) ·
  [MDN localized string selection](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization#localized_string_selection)

## Locale matrix

| Locale | Language | Chrome | Edge | Firefox desktop | Firefox Android |
| --- | --- | --- | --- | --- | --- |
| `ab` | Abkhazian | `en` | `en` | `en` | ✓ |
| `ace` | Acehnese | `en` | `en` | `en` | ✓ |
| `ach` | Acholi | `en` | `en` | ✓ | `en` |
| `af` | Afrikaans | `en` | ✓ | ✓ | ✓ |
| `am` | Amharic | ✓ | ✓ | `en` | ✓ |
| `an` | Aragonese | `en` | `en` | ✓ | ✓ |
| `ann` | Obolo | `en` | `en` | `en` | ✓ |
| `anp` | Angika | `en` | `en` | `en` | ✓ |
| `ar` | Arabic | ✓ | ✓ | ✓ | ✓ |
| `as` | Assamese | `en` | ✓ | `en` | `en` |
| `ast` | Asturian | `en` | `en` | ✓ | ✓ |
| `ay` | Aymara | `en` | `en` | `en` | ✓ |
| `az` | Azerbaijani | `en` | ✓ | ✓ | ✓ |
| `azb` | South Azerbaijani | `en` | `en` | `en` | ✓ |
| `ban` | Balinese | `en` | `en` | `en` | ✓ |
| `be` | Belarusian | `en` | `en` | ✓ | ✓ |
| `bew` | Betawi | `en` | `en` | `en` | ✓ |
| `bg` | Bulgarian | ✓ | ✓ | ✓ | ✓ |
| `bn` | Bangla | ✓ | `bn-IN` → `en` | ✓ | ✓ |
| `bn-IN` | Bangla (India) | `bn` → `en` | ✓ (Win) | `bn` → `en` | `bn` → `en` |
| `bo` | Tibetan | `en` | `en` | `en` | ✓ |
| `bqi` | Bakhtiari | `en` | `en` | `en` | ✓ |
| `br` | Breton | `en` | `en` | ✓ | ✓ |
| `brh` | Brahui | `en` | `en` | `en` | ✓ |
| `bs` | Bosnian | `en` | ✓ | ✓ | ✓ |
| `ca` | Catalan | ✓ | ✓ | ✓ | ✓ |
| `ca-ES-valencia` | Valencian (Spain) | `ca` → `en` | ✓ (Win) | `ca` → `en` | `ca` → `en` |
| `ca-valencia` | Valencian | `ca` → `en` | `ca-ES-valencia` → `en` | ✓ | `ca` → `en` |
| `cak` | Kaqchikel | `en` | `en` | ✓ | ✓ |
| `ceb` | Cebuano | `en` | `en` | `en` | ✓ |
| `ckb` | Central Kurdish | `en` | `en` | `en` | ✓ |
| `co` | Corsican | `en` | `en` | `en` | ✓ |
| `cs` | Czech | ✓ | ✓ | ✓ | ✓ |
| `cy` | Welsh | `en` | ✓ | ✓ | ✓ |
| `da` | Danish | ✓ | ✓ | ✓ | ✓ |
| `de` | German | ✓ | ✓ | ✓ | ✓ |
| `dsb` | Lower Sorbian | `en` | `en` | ✓ | ✓ |
| `el` | Greek | ✓ | ✓ | ✓ | ✓ |
| `en` | English | ✓ | ✓ | `en` | `en` |
| `en-AU` | English (Australia) | ✓ | `en` | `en` | `en` |
| `en-CA` | English (Canada) | `en` | `en` | ✓ | ✓ |
| `en-GB` | English (United Kingdom) | ✓ | ✓ | ✓ | ✓ |
| `en-US` | English (United States) | ✓ | `en` | ✓ | ✓ (source) |
| `eo` | Esperanto | `en` | `en` | ✓ | ✓ |
| `es` | Spanish | ✓ | ✓ | `en` | ✓ |
| `es-419` | Spanish (Latin America) | ✓ | `es-MX` → `en` | `es-ES` → `en` | `es` → `en` |
| `es-AR` | Spanish (Argentina) | `es-419` → `en` | `es-MX` → `en` | ✓ | ✓ |
| `es-CL` | Spanish (Chile) | `es-419` → `en` | `es-MX` → `en` | ✓ | ✓ |
| `es-ES` | Spanish (Spain) | `es` → `en` | `es` → `en` | ✓ | ✓ |
| `es-MX` | Spanish (Mexico) | `es-419` → `en` | ✓ | ✓ | ✓ |
| `et` | Estonian | ✓ | ✓ | ✓ | ✓ |
| `eu` | Basque | `en` | ✓ | ✓ | ✓ |
| `fa` | Persian | ✓ | ✓ | ✓ | ✓ |
| `ff` | Fulah | `en` | `en` | ✓ | ✓ |
| `fi` | Finnish | ✓ | ✓ | ✓ | ✓ |
| `fil` | Filipino | ✓ | ✓ | `tl` → `en` | `tl` → `en` |
| `fr` | French | ✓ | ✓ | ✓ | ✓ |
| `fr-CA` | French (Canada) | `fr` → `en` | ✓ | `fr` → `en` | `fr` → `en` |
| `fur` | Friulian | `en` | `en` | ✓ | ✓ |
| `fy-NL` | Western Frisian (Netherlands) | `en` | `en` | ✓ | ✓ |
| `ga` | Irish | `en` | ✓ | `en` | `en` |
| `ga-IE` | Irish (Ireland) | `en` | `ga` → `en` | ✓ | ✓ |
| `gd` | Scottish Gaelic | `en` | ✓ | ✓ | ✓ |
| `gl` | Galician | `en` | ✓ | ✓ | ✓ |
| `gn` | Guarani | `en` | `en` | ✓ | ✓ |
| `gu` | Gujarati | ✓ | ✓ | `en` | `en` |
| `gu-IN` | Gujarati (India) | `gu` → `en` | `gu` → `en` | ✓ | ✓ |
| `he` | Hebrew | ✓ | ✓ | ✓ | ✓ |
| `hi` | Hindi | ✓ | ✓ | `en` | `en` |
| `hi-IN` | Hindi (India) | `hi` → `en` | `hi` → `en` | ✓ | ✓ |
| `hil` | Hiligaynon | `en` | `en` | `en` | ✓ |
| `hr` | Croatian | ✓ | ✓ | ✓ | ✓ |
| `hsb` | Upper Sorbian | `en` | `en` | ✓ | ✓ |
| `hu` | Hungarian | ✓ | ✓ | ✓ | ✓ |
| `hus` | Huastec | `en` | `en` | `en` | ✓ |
| `hy-AM` | Armenian (Armenia) | `en` | `en` | ✓ | ✓ |
| `ia` | Interlingua | `en` | `en` | ✓ | ✓ |
| `id` | Indonesian | ✓ | ✓ | ✓ | ✓ |
| `is` | Icelandic | `en` | ✓ | ✓ | ✓ |
| `it` | Italian | ✓ | ✓ | ✓ | ✓ |
| `ixl` | Ixil | `en` | `en` | `en` | ✓ |
| `ja` | Japanese | ✓ | ✓ | ✓ | ✓ |
| `ja-JP-mac` | Japanese (legacy macOS locale) | `ja` → `en` | `ja` → `en` | ✓ | `ja` → `en` |
| `jv` | Javanese | `en` | `en` | `en` | ✓ |
| `ka` | Georgian | `en` | ✓ | ✓ | ✓ |
| `kaa` | Karakalpak | `en` | `en` | `en` | ✓ |
| `kab` | Kabyle | `en` | `en` | ✓ | ✓ |
| `kk` | Kazakh | `en` | ✓ | ✓ | ✓ |
| `km` | Khmer | `en` | ✓ | ✓ | ✓ |
| `kmr` | Kurdish | `en` | `en` | `en` | ✓ |
| `kn` | Kannada | ✓ | ✓ | ✓ | ✓ |
| `ko` | Korean | ✓ | ✓ | ✓ | ✓ |
| `kok` | Konkani | `en` | ✓ | `en` | `en` |
| `kw` | Cornish | `en` | `en` | `en` | ✓ |
| `lb` | Luxembourgish | `en` | ✓ | `en` | `en` |
| `lij` | Ligurian | `en` | `en` | ✓ | ✓ |
| `lo` | Lao | `en` | ✓ | `en` | ✓ |
| `lt` | Lithuanian | ✓ | ✓ | ✓ | ✓ |
| `lv` | Latvian | ✓ | ✓ | ✓ | ✓ |
| `meh` | Southwestern Tlaxiaco Mixtec | `en` | `en` | `en` | ✓ |
| `mi` | Māori | `en` | ✓ | `en` | `en` |
| `mix` | Mixtepec Mixtec | `en` | `en` | `en` | ✓ |
| `mk` | Macedonian | `en` | ✓ | ✓ | `en` |
| `ml` | Malayalam | ✓ | ✓ | `en` | ✓ |
| `mr` | Marathi | ✓ | ✓ | ✓ | ✓ |
| `ms` | Malay | ✓ | ✓ | ✓ | ✓ |
| `mt` | Maltese | `en` | ✓ | `en` | `en` |
| `my` | Burmese | `en` | `en` | ✓ | ✓ |
| `nb` | Norwegian Bokmål | `no` → `en` | ✓ | `nb-NO` → `en` | `nb-NO` → `en` |
| `nb-NO` | Norwegian Bokmål (Norway) | `no` → `en` | `nb` → `en` | ✓ | ✓ |
| `ne` | Nepali | `en` | ✓ | `en` | `en` |
| `ne-NP` | Nepali (Nepal) | `en` | `ne` → `en` | ✓ | ✓ |
| `nl` | Dutch | ✓ | ✓ | ✓ | ✓ |
| `nn` | Norwegian Nynorsk | `en` | ✓ | `nn-NO` → `en` | `nn-NO` → `en` |
| `nn-NO` | Norwegian Nynorsk (Norway) | `en` | `nn` → `en` | ✓ | ✓ |
| `no` | Norwegian | ✓ | `nb` → `en` | `nb-NO` → `en` | `nb-NO` → `en` |
| `nv` | Navajo | `en` | `en` | `en` | ✓ |
| `oc` | Occitan | `en` | `en` | ✓ | ✓ |
| `om` | Oromo | `en` | `en` | `en` | ✓ |
| `or` | Odia | `en` | ✓ | `en` | ✓ |
| `pa` | Punjabi | `en` | ✓ | `en` | `en` |
| `pa-IN` | Punjabi (India) | `en` | `pa` → `en` | ✓ | ✓ |
| `pa-PK` | Punjabi (Pakistan) | `en` | `pa` → `en` | `en` | ✓ |
| `pai` | Pe | `en` | `en` | `en` | ✓ |
| `pl` | Polish | ✓ | ✓ | ✓ | ✓ |
| `ppl` | Pipil (Nawat) | `en` | `en` | `en` | ✓ |
| `ps` | Pashto | `en` | `en` | `en` | ✓ |
| `pt-BR` | Portuguese (Brazil) | ✓ | ✓ | ✓ | ✓ |
| `pt-PT` | Portuguese (Portugal) | ✓ | ✓ | ✓ | ✓ |
| `quc` | K'iche' | `en` | `en` | `en` | ✓ |
| `quy` | Quechua (Ayacucho) | `en` | `en` | `en` | ✓ |
| `quz` | Quechua (Cusco) | `en` | ✓ | `en` | `en` |
| `rm` | Romansh | `en` | `en` | ✓ | ✓ |
| `ro` | Romanian | ✓ | ✓ | ✓ | ✓ |
| `ru` | Russian | ✓ | ✓ | ✓ | ✓ |
| `sat` | Santali | `en` | `en` | ✓ | ✓ |
| `sc` | Sardinian | `en` | `en` | ✓ | ✓ |
| `scn` | Sicilian | `en` | `en` | `en` | ✓ |
| `sco` | Scots | `en` | `en` | ✓ | `en` |
| `si` | Sinhala | `en` | `en` | ✓ | ✓ |
| `sk` | Slovak | ✓ | ✓ | ✓ | ✓ |
| `skr` | Saraiki | `en` | `en` | ✓ | ✓ |
| `sl` | Slovenian | ✓ | ✓ | ✓ | ✓ |
| `sn` | Shona | `en` | `en` | `en` | ✓ |
| `son` | Songhay | `en` | `en` | ✓ | `en` |
| `sq` | Albanian | `en` | ✓ | ✓ | ✓ |
| `sr` | Serbian | ✓ | `en` | ✓ | ✓ |
| `sr-Cyrl-BA` | Serbian (Cyrillic, Bosnia & Herzegovina) | `sr` → `en` | ✓ (Win) | `sr` → `en` | `sr` → `en` |
| `sr-Cyrl-RS` | Serbian (Cyrillic, Serbia) | `sr` → `en` | ✓ | `sr` → `en` | `sr` → `en` |
| `sr-Latn-RS` | Serbian (Latin, Serbia) | `sr` → `en` | ✓ | `sr` → `en` | `sr` → `en` |
| `su` | Sundanese | `en` | `en` | `en` | ✓ |
| `sv` | Swedish | ✓ | ✓ | `en` | `en` |
| `sv-SE` | Swedish (Sweden) | `sv` → `en` | `sv` → `en` | ✓ | ✓ |
| `sw` | Swahili | ✓ | `en` | `en` | `en` |
| `szl` | Silesian | `en` | `en` | ✓ | ✓ |
| `ta` | Tamil | ✓ | ✓ | ✓ | ✓ |
| `te` | Telugu | ✓ | ✓ | ✓ | ✓ |
| `tg` | Tajik | `en` | `en` | ✓ | ✓ |
| `th` | Thai | ✓ | ✓ | ✓ | ✓ |
| `tl` | Tagalog | `fil` → `en` | `fil` → `en` | ✓ | ✓ |
| `tok` | Toki Pona | `en` | `en` | `en` | ✓ |
| `tr` | Turkish | ✓ | ✓ | ✓ | ✓ |
| `trs` | Chicahuaxtla Triqui | `en` | `en` | ✓ | ✓ |
| `tsz` | Purepecha | `en` | `en` | `en` | ✓ |
| `tt` | Tatar | `en` | ✓ | `en` | ✓ |
| `tzm` | Central Atlas Tamazight | `en` | `en` | `en` | ✓ |
| `ug` | Uyghur | `en` | ✓ | `en` | ✓ |
| `uk` | Ukrainian | ✓ | ✓ | ✓ | ✓ |
| `ur` | Urdu | `en` | ✓ | ✓ | ✓ |
| `uz` | Uzbek | `en` | `en` | ✓ | ✓ |
| `vec` | Venetian | `en` | `en` | `en` | ✓ |
| `vi` | Vietnamese | ✓ | ✓ | ✓ | ✓ |
| `wo` | Wolof | `en` | `en` | `en` | ✓ |
| `xh` | Xhosa | `en` | `en` | ✓ | `en` |
| `yo` | Yoruba | `en` | `en` | `en` | ✓ |
| `yua` | Yucatec Maya | `en` | `en` | `en` | ✓ |
| `yue` | Cantonese | `en` | `en` | `en` | ✓ |
| `zam` | Miahuatlan Zapotec | `en` | `en` | `en` | ✓ |
| `zh-CN` | Chinese (China) | ✓ | ✓ | ✓ | ✓ |
| `zh-HK` | Chinese (Hong Kong) | `zh-TW` → `en` | `zh-TW` → `en` | `zh-TW` → `en` | ✓ |
| `zh-TW` | Chinese (Taiwan) | ✓ | ✓ | ✓ | ✓ |
