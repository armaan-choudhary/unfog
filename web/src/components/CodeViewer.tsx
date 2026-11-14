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

    // Clean up previous view if exists
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const customTheme = EditorView.theme({
      '&': {
        height: '100%',
        backgroundColor: '#0c101c !important',
        color: '#e2e8f0',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: '13px',
      },
      '.cm-scroller': {
        overflow: 'auto',
        lineHeight: '1.6',
      },
      '.cm-gutters': {
        backgroundColor: '#090d16',
        color: '#475569',
        borderRight: '1px solid #1e293b',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#1e293b',
        color: '#38bdf8',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        color: '#94a3b8',
        borderRadius: '4px',
        padding: '0 6px',
        margin: '0 4px',
        fontWeight: 'bold',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(56, 189, 248, 0.05)',
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
          el.className = 'cm-fold-marker text-slate-500 hover:text-cyan-400 cursor-pointer text-xs';
          el.textContent = open ? '▼' : '▶';
          return el;
        },
      }),
      javascript({ jsx: true, typescript: true }),
      oneDark,
      customTheme,
      EditorView.editable.of(false), // read-only viewer
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
      // Delay slightly to let layout compute
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
    <div className="flex flex-col h-full bg-[#0c101c] border-t border-slate-800">
      {/* Code Viewer Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-slate-300 font-medium">
            {step.file}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
            function {step.symbol}()
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            (Lines {step.targetLineRange.start}–{step.targetLineRange.end})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fold/Unfold Toggle */}
          <button
            onClick={toggleFoldMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors border ${
              isFoldedFocus
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title={isFoldedFocus ? 'Click to show full file' : 'Click to fold unrelated lines'}
          >
            <FoldHorizontal className="w-3.5 h-3.5" />
            <span>{isFoldedFocus ? 'Focused Function (Folded)' : 'Full File (Unfolded)'}</span>
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-mono">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="font-mono">Copy</span>
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
