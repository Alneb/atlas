// Code-file syntax colours, from the same --syn-* variables the hljs reading theme uses.
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const atlasHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--syn-keyword)", fontWeight: "var(--syn-keyword-weight, normal)", fontStyle: "var(--syn-keyword-style, normal)" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: "var(--syn-string)", fontWeight: "var(--syn-string-weight, normal)", fontStyle: "var(--syn-string-style, normal)" },
  { tag: [t.number], color: "var(--syn-number)" },
  { tag: [t.bool, t.null, t.atom], color: "var(--syn-constant, var(--syn-number))", fontStyle: "var(--syn-constant-style, normal)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--syn-comment)", fontStyle: "var(--syn-comment-style, italic)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "var(--syn-function)", fontWeight: "var(--syn-function-weight, normal)", fontStyle: "var(--syn-function-style, normal)" },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: "var(--syn-type)", fontWeight: "var(--syn-type-weight, normal)", fontStyle: "var(--syn-type-style, normal)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--syn-property)", fontWeight: "var(--syn-property-weight, normal)", fontStyle: "var(--syn-property-style, normal)" },
  { tag: [t.definition(t.variableName), t.labelName], color: "var(--syn-variable)", fontWeight: "var(--syn-variable-weight, 500)" },
  { tag: [t.variableName], color: "var(--syn-variable)", fontWeight: "var(--syn-variable-weight, normal)" },
  { tag: [t.self, t.special(t.variableName), t.constant(t.variableName)], color: "var(--syn-number)" },
  { tag: [t.function(t.definition(t.variableName))], color: "var(--syn-function)", fontWeight: "500" },
  { tag: [t.operator], color: "var(--syn-operator)" },
  { tag: [t.punctuation, t.separator, t.bracket], color: "var(--syn-punctuation, var(--syn-operator))" },
  { tag: [t.meta, t.annotation, t.processingInstruction], color: "var(--syn-meta)", fontWeight: "var(--syn-meta-weight, normal)", fontStyle: "var(--syn-meta-style, normal)" },
  { tag: [t.tagName], color: "var(--syn-tag)", fontWeight: "var(--syn-tag-weight, normal)", fontStyle: "var(--syn-tag-style, normal)" },
  { tag: [t.heading], color: "var(--heading)", fontWeight: "700" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  { tag: [t.link, t.url], color: "var(--link)", textDecoration: "underline" },
  { tag: [t.invalid], color: "var(--red)" },
  { tag: [t.escape], color: "var(--syn-number)" },
]);
