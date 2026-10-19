"use client";

import { useEffect, useState } from "react";

type Photo = { full: Blob; thumb: Blob; preview: string };

const CONTACT_KEY = "vn-market-contact"; // 다음 글쓰기 때 연락처를 미리 채운다

// 사진을 브라우저에서 줄여 JPEG로 만든다 (긴 변 기준). 서버 저장 용량과 데이터 요금을 아끼려고
async function shrink(file: File, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("변환 실패"))), "image/jpeg", quality));
}

export default function NewItemForm({ categories, areas, maxPhotos }: { categories: string[]; areas: string[]; maxPhotos: number }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [free, setFree] = useState(false);
  const [price, setPrice] = useState("");
  const [area, setArea] = useState(areas[0]);
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONTACT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setContact(saved);
    } catch {}
  }, []);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    const room = maxPhotos - photos.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setError(`사진은 ${maxPhotos}장까지예요.`);
    const added: Photo[] = [];
    for (const f of picked) {
      try {
        const full = await shrink(f, 1280, 0.82);
        const thumb = await shrink(f, 360, 0.75);
        added.push({ full, thumb, preview: URL.createObjectURL(thumb) });
      } catch {
        setError("열 수 없는 사진이 있어요. JPG·PNG 사진을 골라 주세요.");
      }
    }
    setPhotos((p) => [...p, ...added]);
  }

  function removePhoto(i: number) {
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].preview);
      return p.filter((_, k) => k !== i);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return setError("카테고리를 골라 주세요.");
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("title", title);
    form.set("category", category);
    form.set("price", free ? "0" : price);
    form.set("area", area);
    form.set("description", description);
    form.set("contact", contact);
    photos.forEach((p, i) => {
      form.set(`photo${i}`, p.full, `photo${i}.jpg`);
      form.set(`thumb${i}`, p.thumb, `thumb${i}.jpg`);
    });
    try {
      const res = await fetch("/api/market/items", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; id?: number; error?: string };
      if (!data.ok) throw new Error(data.error ?? "올리지 못했어요.");
      try {
        localStorage.setItem(CONTACT_KEY, contact);
      } catch {}
      window.location.href = `/market/${data.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "올리지 못했어요.");
      setBusy(false);
    }
  }

  const field = "mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-transparent px-3.5 text-[15px] outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300";
  const label = "text-[13px] font-semibold text-zinc-600 dark:text-zinc-400";

  return (
    <form onSubmit={submit} className="mt-5 space-y-5">
      {/* 사진 */}
      <div>
        <p className={label}>
          사진 <span className="font-normal text-zinc-400">({photos.length}/{maxPhotos})</span>
        </p>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
          {photos.length < maxPhotos && (
            <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
              <span className="text-xl" aria-hidden>
                📷
              </span>
              사진 추가
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files).then(() => (e.target.value = ""))} />
            </label>
          )}
          {photos.map((p, i) => (
            <div key={p.preview} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`사진 ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`사진 ${i + 1} 빼기`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              >
                ✕
              </button>
              {i === 0 && <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold text-white">대표</span>}
            </div>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={label}>제목</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required placeholder="예) 샤오미 공기청정기 2년 사용" className={field} />
      </label>

      <label className="block">
        <span className={label}>카테고리</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} required className={field}>
          <option value="">고르기</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>

      <div>
        <span className={label}>가격 (동)</span>
        <div className="mt-1.5 flex items-center gap-3">
          <input
            value={free ? "" : price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            disabled={free}
            required={!free}
            placeholder={free ? "나눔" : "예) 500000"}
            className={`${field} mt-0 flex-1 disabled:opacity-50`}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="h-4 w-4 accent-rose-600" />
            나눔
          </label>
        </div>
        {!free && price && <p className="mt-1 text-xs text-zinc-500">{Number(price).toLocaleString("ko-KR")}동</p>}
      </div>

      <label className="block">
        <span className={label}>거래 지역</span>
        <select value={area} onChange={(e) => setArea(e.target.value)} className={field}>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={label}>설명</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={3000}
          rows={6}
          placeholder="상태, 사용 기간, 거래 장소·시간 등을 적어 주세요."
          className={`${field} h-auto py-3 leading-relaxed`}
        />
      </label>

      <label className="block">
        <span className={label}>연락처 (카카오톡 ID 또는 오픈채팅 링크)</span>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={120}
          required
          placeholder="예) nhatrang_kim 또는 https://open.kakao.com/o/..."
          className={field}
        />
        <span className="mt-1 block text-xs text-zinc-500">로그인한 회원에게만 보여요.</span>
      </label>

      <div className="rounded-xl bg-zinc-50 p-4 text-[13px] leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200">올리기 전에</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>의약품, 담배·술, 위조품, 동물, 불법 물품은 올릴 수 없어요.</li>
          <li>직접 만나 물건을 확인하고 거래하는 것을 권해요. 선입금 요구는 조심하세요.</li>
          <li>신고가 쌓인 글은 자동으로 숨겨져요.</li>
        </ul>
      </div>

      {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-xl bg-rose-600 text-[15px] font-bold text-white disabled:opacity-50"
      >
        {busy ? "올리는 중…" : "올리기"}
      </button>
    </form>
  );
}
