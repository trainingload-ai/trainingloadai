"use client";
import "./tiptap.css";
import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import debounce from "lodash/debounce";
import {
  PLAN_DESCRIPTION_MAX_CHARS,
  planDescriptionTextLength,
} from "@/lib/plan-description-limit";
import { cn } from "@/lib/utils";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import { EditorContent, type Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorToolbar } from "./toolbars/editor-toolbar";

const extensions = [
  StarterKit.configure({
    orderedList: {
      HTMLAttributes: {
        class: "list-decimal",
      },
    },
    bulletList: {
      HTMLAttributes: {
        class: "list-disc",
      },
    },
    heading: {
      levels: [1, 2, 3, 4],
    },
  }),
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
  TextStyle,
  Subscript,
  Superscript,
  Underline,
  Color,
  Highlight.configure({
    multicolor: true,
  }),
  Typography,
];

interface PlanDescriptionProps {
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export function PlanDescription({
  className,
  value,
  onChange,
  disabled,
}: PlanDescriptionProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastValidHtmlRef = useRef(value ?? "");

  const emitHtml = useMemo(
    () =>
      debounce((html: string) => {
        onChangeRef.current?.(html);
      }, 200),
    [],
  );

  useEffect(() => () => emitHtml.cancel(), [emitHtml]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: !disabled,
      extensions: extensions as Extension[],
      content: value ?? "",
      editorProps: {
        attributes: {
          class:
            "tiptap-editor-root max-w-full text-sm leading-relaxed text-foreground focus:outline-none",
        },
      },
      onUpdate: ({ editor: ed }) => {
        const html = ed.getHTML();
        const len = planDescriptionTextLength(html);
        const prev = lastValidHtmlRef.current;
        const prevLen = planDescriptionTextLength(prev);

        if (len <= PLAN_DESCRIPTION_MAX_CHARS) {
          lastValidHtmlRef.current = html;
          emitHtml(html);
          return;
        }
        if (len < prevLen) {
          lastValidHtmlRef.current = html;
          emitHtml(html);
          return;
        }
        ed.commands.setContent(prev, false);
      },
      onBlur: ({ editor: ed }) => {
        emitHtml.cancel();
        const html = ed.getHTML();
        const len = planDescriptionTextLength(html);
        const prev = lastValidHtmlRef.current;
        const prevLen = planDescriptionTextLength(prev);
        if (len > PLAN_DESCRIPTION_MAX_CHARS && len >= prevLen) {
          ed.commands.setContent(prev, false);
        }
        lastValidHtmlRef.current = ed.getHTML();
        onChangeRef.current?.(ed.getHTML());
      },
    },
    [disabled],
  );

  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const next = value ?? "";
    if (editor.getHTML() === next) return;
    editor.commands.setContent(next, false);
    lastValidHtmlRef.current = next;
  }, [value, editor]);

  if (!editor) return null;

  const handleEditorAreaMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".ProseMirror")) return;
    event.preventDefault();
    editor.chain().focus("end").run();
  };

  return (
    <div
      className={cn(
        "plan-description-editor relative flex w-full flex-col overflow-hidden rounded-md border border-input bg-background",
        disabled && "pointer-events-none opacity-80",
        className,
      )}
    >
      {!disabled && <EditorToolbar editor={editor} />}
      <div
        className="min-h-0 flex flex-1 cursor-text overflow-y-auto"
        onMouseDown={handleEditorAreaMouseDown}
      >
        <EditorContent
          editor={editor}
          className="flex min-h-full w-full min-w-0 flex-1 cursor-text [&_.tiptap]:min-h-full [&_.tiptap]:w-full"
        />
      </div>
    </div>
  );
}

export const PlanDescriptionRender = (props: PlanDescriptionProps) => (
  <PlanDescription {...props} />
);
