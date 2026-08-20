'use client';

import { useEffect, useRef, useState } from 'react';

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

/**
 * 아주 간단한 본문 편집기.
 * 굵게 · 줄바꿈 · 링크 · 정렬(좌/중/우) 만 지원합니다.
 * 표나 폰트 크기 같은 고급 기능은 일부러 넣지 않았습니다.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = '본문을 입력하세요',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  // 바깥에서 값이 바뀐 경우(템플릿 삽입 등)에만 DOM 을 맞춰 줍니다.
  // 타이핑 중에는 값이 같으므로 커서가 튀지 않습니다.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  const emit = () => {
    const editor = editorRef.current;
    if (editor) onChange(editor.innerHTML);
  };

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = savedRange.current;
    if (selection && range) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const run = (command: string, argument?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, argument);
    emit();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url || !/^(https?:\/\/|mailto:|tel:|\/)/i.test(url)) return;
    run('createLink', url);
    setLinkUrl('https://');
  };

  const toolButton =
    'rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] text-slate-700 hover:bg-slate-50';

  return (
    <div className="rounded-md border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 p-2">
        <button type="button" onMouseDown={rememberSelection} onClick={() => run('bold')} className={`${toolButton} font-bold`}>
          굵게
        </button>
        <button
          type="button"
          onMouseDown={rememberSelection}
          onClick={() => run('insertLineBreak')}
          className={toolButton}
        >
          줄바꿈
        </button>
        <button
          type="button"
          onMouseDown={rememberSelection}
          onClick={() => setLinkOpen((prev) => !prev)}
          className={toolButton}
        >
          링크
        </button>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button type="button" onMouseDown={rememberSelection} onClick={() => run('justifyLeft')} className={toolButton}>
          좌
        </button>
        <button type="button" onMouseDown={rememberSelection} onClick={() => run('justifyCenter')} className={toolButton}>
          중
        </button>
        <button type="button" onMouseDown={rememberSelection} onClick={() => run('justifyRight')} className={toolButton}>
          우
        </button>
      </div>

      {linkOpen ? (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
            aria-label="링크 주소"
            className="admin-input flex-1"
          />
          <button type="button" onClick={applyLink} className="admin-btn">
            적용
          </button>
          <button type="button" onClick={() => setLinkOpen(false)} className="admin-btn">
            취소
          </button>
        </div>
      ) : null}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="본문"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={() => {
          rememberSelection();
          emit();
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        className="min-h-[140px] p-3 text-[15px] leading-[1.9] text-slate-900 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
