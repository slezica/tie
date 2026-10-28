// Code highlighting for viewers (markdown fences, text files): highlight.js core + common
// languages only (bundle size), no auto-detect. Token colors: the theme's code token colors
// (--code-<token>, themes.ts `code`), else the ANSI palette (--a0..--a15). docs/MARKDOWN.md "Rendering".
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { style } from './runtime'

// Aliases come with each (js, ts, sh, py, html, toml...).
const LANGS = { bash, c, cpp, css, diff, dockerfile, go, ini, java, javascript, json, makefile, markdown, python, ruby, rust, shell, sql, swift, typescript, xml, yaml }
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang)

// Highlighted HTML (escaped text + token spans), or '' for an unknown language.
export function highlight(code: string, lang: string): string {
  return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : ''
}

style(`
.hljs-comment, .hljs-quote { color: var(--code-comment, var(--muted)); font-style: var(--code-comment-style, italic); font-weight: var(--code-comment-weight, 400); }
.hljs-keyword, .hljs-selector-tag, .hljs-doctag, .hljs-meta .hljs-keyword { color: var(--code-keyword, var(--a5)); font-style: var(--code-keyword-style, normal); font-weight: var(--code-keyword-weight, 400); }
.hljs-string, .hljs-addition, .hljs-meta .hljs-string { color: var(--code-string, var(--a2)); font-style: var(--code-string-style, normal); font-weight: var(--code-string-weight, 400); }
.hljs-regexp { color: var(--code-regexp, var(--code-string, var(--a2))); font-style: var(--code-regexp-style, normal); font-weight: var(--code-regexp-weight, 400); }
.hljs-number, .hljs-literal, .hljs-bullet { color: var(--code-number, var(--a3)); font-style: var(--code-number-style, normal); font-weight: var(--code-number-weight, 400); }
.hljs-symbol { color: var(--code-symbol, var(--code-number, var(--a3))); font-style: var(--code-symbol-style, normal); font-weight: var(--code-symbol-weight, 400); }
.hljs-title, .hljs-title.function_ { color: var(--code-title, var(--a4)); font-style: var(--code-title-style, normal); font-weight: var(--code-title-weight, 400); }
.hljs-section { color: var(--code-section, var(--code-title, var(--a4))); font-style: var(--code-section-style, normal); font-weight: var(--code-section-weight, 400); }
.hljs-type, .hljs-title.class_, .hljs-title.class_.inherited__, .hljs-selector-class, .hljs-selector-id { color: var(--code-type, var(--a6)); font-style: var(--code-type-style, normal); font-weight: var(--code-type-weight, 400); }
.hljs-built_in { color: var(--code-builtin, var(--code-type, var(--a6))); font-style: var(--code-builtin-style, normal); font-weight: var(--code-builtin-weight, 400); }
.hljs-attr, .hljs-attribute, .hljs-property { color: var(--code-attr, var(--a1)); font-style: var(--code-attr-style, normal); font-weight: var(--code-attr-weight, 400); }
.hljs-variable, .hljs-template-variable { color: var(--code-variable, var(--code-attr, var(--a1))); font-style: var(--code-variable-style, normal); font-weight: var(--code-variable-weight, 400); }
.hljs-variable.language_ { color: var(--code-self, var(--code-variable, var(--a1))); font-style: var(--code-self-style, normal); font-weight: var(--code-self-weight, 400); }
.hljs-name, .hljs-tag, .hljs-tag .hljs-attr { color: var(--code-tag, var(--code-keyword, var(--a5))); font-style: var(--code-tag-style, normal); font-weight: var(--code-tag-weight, 400); }
.hljs-meta { color: var(--code-meta, var(--a4)); font-style: var(--code-meta-style, normal); font-weight: var(--code-meta-weight, 400); }
.hljs-link { color: var(--code-link, var(--code-meta, var(--a4))); font-style: var(--code-link-style, normal); font-weight: var(--code-link-weight, 400); }
.hljs-deletion { color: var(--code-deletion, var(--a1)); }
.hljs-operator { color: var(--code-operator, currentColor); }
.hljs-punctuation { color: var(--code-punctuation, currentColor); }
.hljs-params { color: var(--code-params, currentColor); }
.hljs-char.escape_, .hljs-subst { color: var(--code-escape, currentColor); }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 600; }
`)
