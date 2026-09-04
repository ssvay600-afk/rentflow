"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Image picker with live preview and a placeholder. Submits three fields:
 *   <name>File   – the chosen file (if any)
 *   <name>Url    – a pasted link (or the current URL)
 *   <name>Remove – "on" when the user cleared the image
 */
export function ImageField({
  name,
  label,
  current,
  hint,
  shape = "wide",
  placeholderText = "No image yet",
  uploadsEnabled = true,
}: {
  name: string;
  label: string;
  current: string;
  hint?: string;
  shape?: "wide" | "square" | "logo";
  placeholderText?: string;
  uploadsEnabled?: boolean;
}) {
  const [preview, setPreview] = useState<string>(current);
  const [url, setUrl] = useState<string>(current);
  const [removed, setRemoved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(f);
    setPreview(objectUrl.current);
    setRemoved(false);
  }

  function clear() {
    if (fileRef.current) fileRef.current.value = "";
    setPreview("");
    setUrl("");
    setRemoved(true);
  }

  const box = shape === "logo" ? "h-24 w-24 rounded-xl" : shape === "square" ? "h-40 w-40 rounded-xl" : "h-36 w-full rounded-xl";

  return (
    <div>
      <span className="label">{label}</span>
      <div className={`flex ${shape === "wide" ? "flex-col" : "flex-row"} gap-4`}>
        <div className={`${box} relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-slate-50`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="px-3 text-center text-xs text-slate-400">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-1 text-slate-300" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 8" />
              </svg>
              {placeholderText}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label className={`btn-secondary w-fit cursor-pointer ${uploadsEnabled ? "" : "pointer-events-none opacity-60"}`}>
            {preview ? "Replace image" : "Upload image"}
            <input ref={fileRef} type="file" name={`${name}File`} accept="image/*" className="sr-only" onChange={onFile} disabled={!uploadsEnabled} />
          </label>
          <input
            type="url"
            name={`${name}Url`}
            value={url}
            onChange={(e) => { setUrl(e.target.value); setPreview(e.target.value); setRemoved(false); }}
            placeholder="…or paste an image link (https://)"
            className="input"
          />
          <input type="hidden" name={`${name}Remove`} value={removed ? "on" : ""} />
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {(preview || url) && <button type="button" onClick={clear} className="text-rose-700 hover:underline">Remove</button>}
            <span>{hint ?? "JPG, PNG or WebP, up to 5 MB."}{!uploadsEnabled && " Uploads are disabled on this install; paste a link instead."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
