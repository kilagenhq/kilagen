import { marked } from 'marked';
import DOMPurify from 'dompurify';
import jsyaml from 'js-yaml';

globalThis.marked = marked;
globalThis.DOMPurify = DOMPurify;
globalThis.jsyaml = jsyaml;
