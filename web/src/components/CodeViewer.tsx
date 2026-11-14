import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { codeFolding, foldGutter, foldEffect, unfoldAll } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { ExecutionStepData } from '../types';
import { 
  Copy, 
  Check, 
  FoldHorizontal, 
  FileCode 
} from 'lucide-react';

interface CodeViewerProps {
  step: ExecutionStepData;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ step }) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFoldedFocus, setIsFoldedFocus] = useState(true);

  // Apply folds to conceal everything outside the active step's function
  const applyFolding = useCallback((view: EditorView, stepData: ExecutionStepData) => {
    const doc = view.state.doc;
    const { start, end } = stepData.targetLineRange;
    const totalLines = doc.lines;

    // First unfold all to reset
    unfoldAll(view);

    const effects: any[] = [];

    // Fold 1: From start of file to line (start - 1)
    if (start > 2) {
      const lineBefore = doc.line(start - 1);
      effects.push(foldEffect.of({ from: 0, to: lineBefore.to }));
    }

    // Fold 2: From line (end + 1) to end of file
    if (end < totalLines - 1) {
      const lineAfter = doc.line(end + 1);
      const lastLine = doc.line(totalLines);
      effects.push(foldEffect.of({ from: lineAfter.from, to: lastLine.to }));
    }

    if (effects.length > 0) {
      view.dispatch({ effects });
    }

    // Scroll active function into view
    const targetLine = doc.line(Math.min(start, totalLines));
    view.dispatch({
      effects: EditorView.scrollIntoView(targetLine.from, { y: 'center' }),
    });
  }, []);

  // Initialize and update CodeMirror
  useEffect(() => {
    if (!editorContainerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const customTheme = EditorView.theme({
      '&': {
        height: '100%',
        backgroundColor: '#07090e !important',
        color: '#e4e4e7',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: '12.5px',
      },
      '.cm-scroller': {
        overflow: 'auto',
        lineHeight: '1.65',
      },
      '.cm-gutters': {
        backgroundColor: '#07090e',
        color: '#52525b',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255,255,255,0.04)',
        color: '#22d3ee',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#71717a',
        borderRadius: '3px',
        padding: '0 6px',
        margin: '0 4px',
        fontWeight: 'bold',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(6, 182, 212, 0.03)',
      },
    });

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      drawSelection(),
      codeFolding(),
      foldGutter({
        markerDOM: (open) => {
          const el = document.createElement('span');
          el.className = 'cm-fold-marker text-zinc-600 hover:text-cyan-400 cursor-pointer text-xs';
          el.textContent = open ? '▼' : '▶';
          return el;
        },
      }),
      javascript({ jsx: true, typescript: true }),
      oneDark,
      customTheme,
      EditorView.editable.of(false),
    ];

    const state = EditorState.create({
      doc: step.fullCode,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    if (isFoldedFocus) {
      setTimeout(() => applyFolding(view, step), 50);
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [step, isFoldedFocus, applyFolding]);

  const toggleFoldMode = () => {
    const nextState = !isFoldedFocus;
    setIsFoldedFocus(nextState);
    if (viewRef.current) {
      if (nextState) {
        applyFolding(viewRef.current, step);
      } else {
        unfoldAll(viewRef.current);
      }
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(
        isFoldedFocus ? step.activeFunctionCode : step.fullCode
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#07090e] border-t border-white/[0.08]">
      {/* Code Viewer Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#090b10] border-b border-white/[0.08] text-xs font-mono">
        <div className="flex items-center gap-2">
          <FileCode className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-zinc-300 font-medium">
            {step.file}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] text-cyan-400 border border-white/10">
            function {step.symbol}()
          </span>
          <span className="text-[10px] text-zinc-600 hidden sm:inline">
            (Lines {step.targetLineRange.start}–{step.targetLineRange.end})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fold/Unfold Toggle */}
          <button
            onClick={toggleFoldMode}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors border ${
              isFoldedFocus
                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30'
                : 'bg-white/[0.03] text-zinc-500 border-white/[0.08] hover:text-zinc-300'
            }`}
            title={isFoldedFocus ? 'Show full file' : 'Fold unrelated lines'}
          >
            <FoldHorizontal className="w-3 h-3" />
            <span>{isFoldedFocus ? 'Folded' : 'Unfolded'}</span>
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.08] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-cyan-400" />
                <span className="text-cyan-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* CodeMirror 6 Container */}
      <div className="flex-1 w-full overflow-hidden relative" ref={editorContainerRef} />
    </div>
  );
};
