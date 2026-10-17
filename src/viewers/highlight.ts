// Code highlighting for viewers (markdown fences, text files): highlight.js core + common
// languages only (bundle size), no auto-detect. Token colors: the theme's ANSI palette
// (--a0..--a15). docs/MARKDOWN.md "Rendering".
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
.hljs-comment, .hljs-quote { color: var(--muted); font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-doctag, .hljs-meta .hljs-keyword { color: var(--a5); }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-meta .hljs-string { color: var(--a2); }
.hljs-number, .hljs-literal, .hljs-symbol, .hljs-bullet { color: var(--a3); }
.hljs-title, .hljs-section, .hljs-title.function_ { color: var(--a4); }
.hljs-type, .hljs-built_in, .hljs-title.class_, .hljs-selector-class, .hljs-selector-id { color: var(--a6); }
.hljs-attr, .hljs-attribute, .hljs-property, .hljs-variable, .hljs-template-variable, .hljs-name { color: var(--a1); }
.hljs-meta, .hljs-link { color: var(--a4); }
.hljs-deletion { color: var(--a1); }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 600; }
`)
