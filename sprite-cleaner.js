// Untitled Fishing - sprite collision cleaner
// Keeps only the main transparent "island" from each generated fish PNG so
// neighboring sprites/fragments can never appear in another fish's UI box.
(() => {
  const cache = new Map();
  const pending = new Map();
  const ANALYZE = 128;
  const TILE = 256;
  const INNER = 220;

  const isFishAsset = src => /(?:^|\/)assets\/fish\/[^/?#]+\.png(?:[?#].*)?$/i.test(src || "");

  function isolate(src) {
    if (cache.has(src)) return Promise.resolve(cache.get(src));
    if (pending.has(src)) return pending.get(src);

    const job = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        try {
          const sw = image.naturalWidth || image.width;
          const sh = image.naturalHeight || image.height;
          if (!sw || !sh) throw new Error("Empty image");

          // Analyze a small copy for speed.
          const scale = Math.min(1, ANALYZE / Math.max(sw, sh));
          const mw = Math.max(1, Math.round(sw * scale));
          const mh = Math.max(1, Math.round(sh * scale));
          const scan = document.createElement("canvas");
          scan.width = mw;
          scan.height = mh;
          const sctx = scan.getContext("2d", { willReadFrequently: true });
          sctx.imageSmoothingEnabled = false;
          sctx.drawImage(image, 0, 0, mw, mh);
          const data = sctx.getImageData(0, 0, mw, mh).data;
          const count = mw * mh;
          const labels = new Uint16Array(count);
          const queue = new Int32Array(count);
          const sizes = [0];
          let label = 0;
          const alpha = i => data[i * 4 + 3];

          // Find all alpha-connected pieces. The actual fish is the largest piece;
          // stray parts from neighboring fish are smaller disconnected pieces.
          for (let start = 0; start < count; start++) {
            if (labels[start] || alpha(start) <= 20) continue;
            label++;
            let head = 0, tail = 0, size = 0;
            queue[tail++] = start;
            labels[start] = label;
            while (head < tail) {
              const cur = queue[head++];
              size++;
              const x = cur % mw;
              const y = (cur / mw) | 0;
              for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= mh) continue;
                for (let dx = -1; dx <= 1; dx++) {
                  if (!dx && !dy) continue;
                  const nx = x + dx;
                  if (nx < 0 || nx >= mw) continue;
                  const ni = ny * mw + nx;
                  if (!labels[ni] && alpha(ni) > 20) {
                    labels[ni] = label;
                    queue[tail++] = ni;
                  }
                }
              }
            }
            sizes[label] = size;
          }
          if (!label) throw new Error("No visible pixels");

          let main = 1;
          for (let i = 2; i <= label; i++) if ((sizes[i] || 0) > (sizes[main] || 0)) main = i;

          const maskPixels = sctx.createImageData(mw, mh);
          let minX = mw, minY = mh, maxX = -1, maxY = -1;
          for (let i = 0; i < count; i++) {
            if (labels[i] !== main) continue;
            const x = i % mw;
            const y = (i / mw) | 0;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            const p = i * 4;
            maskPixels.data[p] = maskPixels.data[p + 1] = maskPixels.data[p + 2] = 255;
            maskPixels.data[p + 3] = 255;
          }

          const smallMask = document.createElement("canvas");
          smallMask.width = mw;
          smallMask.height = mh;
          smallMask.getContext("2d").putImageData(maskPixels, 0, 0);

          const isolated = document.createElement("canvas");
          isolated.width = sw;
          isolated.height = sh;
          const ictx = isolated.getContext("2d");
          ictx.imageSmoothingEnabled = false;
          ictx.drawImage(image, 0, 0);
          ictx.globalCompositeOperation = "destination-in";
          ictx.drawImage(smallMask, 0, 0, sw, sh);
          ictx.globalCompositeOperation = "source-over";

          const sx = sw / mw, sy = sh / mh;
          const px = Math.max(2, Math.round((maxX - minX + 1) * sx * 0.08));
          const py = Math.max(2, Math.round((maxY - minY + 1) * sy * 0.08));
          const x0 = Math.max(0, Math.floor(minX * sx) - px);
          const y0 = Math.max(0, Math.floor(minY * sy) - py);
          const x1 = Math.min(sw, Math.ceil((maxX + 1) * sx) + px);
          const y1 = Math.min(sh, Math.ceil((maxY + 1) * sy) + py);
          const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);

          const out = document.createElement("canvas");
          out.width = TILE;
          out.height = TILE;
          const octx = out.getContext("2d");
          octx.imageSmoothingEnabled = false;
          const fit = Math.min(INNER / cw, INNER / ch);
          const dw = Math.max(1, Math.round(cw * fit));
          const dh = Math.max(1, Math.round(ch * fit));
          octx.drawImage(isolated, x0, y0, cw, ch, (TILE - dw) >> 1, (TILE - dh) >> 1, dw, dh);

          const clean = out.toDataURL("image/png");
          cache.set(src, clean);
          resolve(clean);
        } catch (err) {
          reject(err);
        }
      };
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    }).finally(() => pending.delete(src));

    pending.set(src, job);
    return job;
  }

  function clean(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const raw = img.getAttribute("src") || "";
    if (!isFishAsset(raw)) return;
    const absolute = new URL(raw, document.baseURI).href;
    if (img.dataset.ufCleaning === absolute || img.dataset.ufCleaned === absolute) return;

    img.dataset.ufCleaning = absolute;
    img.style.visibility = "hidden";
    isolate(absolute).then(cleanUrl => {
      // Result image can be reused for another catch before this finishes.
      if (img.dataset.ufCleaning !== absolute) return;
      img.src = cleanUrl;
      img.dataset.ufCleaned = absolute;
      img.dataset.ufCleaning = "";
      img.style.visibility = "visible";
    }).catch(err => {
      console.warn("Untitled Fishing sprite cleaner:", err);
      if (img.dataset.ufCleaning === absolute) {
        img.dataset.ufCleaning = "";
        img.style.visibility = "visible";
      }
    });
  }

  function scan(root) {
    if (root instanceof HTMLImageElement) clean(root);
    if (root && root.querySelectorAll) root.querySelectorAll("img").forEach(clean);
  }

  scan(document);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") clean(record.target);
      for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
})();
