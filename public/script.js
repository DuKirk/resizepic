(function(){
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const bench = document.getElementById('bench');
  const stageImg = document.getElementById('stageImg');
  const stageInner = document.getElementById('stageInner');
  const cropBox = document.getElementById('cropBox');

  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const lockAspectBtn = document.getElementById('lockAspectBtn');
  const applyResizeBtn = document.getElementById('applyResize');
  const applyCropBtn = document.getElementById('applyCrop');
  const resetCropBtn = document.getElementById('resetCrop');

  const targetKbInput = document.getElementById('targetKb');
  const formatSelect = document.getElementById('formatSelect');
  const compressBtn = document.getElementById('compressBtn');
  const compressStatus = document.getElementById('compressStatus');

  const pctSlider = document.getElementById('pctSlider');
  const pctValue = document.getElementById('pctValue');
  const pctReadout = document.getElementById('pctReadout');
  const applyPctBtn = document.getElementById('applyPct');

  const qualityFormatSelect = document.getElementById('qualityFormatSelect');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValue = document.getElementById('qualityValue');
  const qualityReadout = document.getElementById('qualityReadout');
  const applyQualityBtn = document.getElementById('applyQuality');

  const convertFormat = document.getElementById('convertFormat');
  const convertQualityRow = document.getElementById('convertQualityRow');
  const convertQuality = document.getElementById('convertQuality');
  const convertQualityValue = document.getElementById('convertQualityValue');
  const convertBtn = document.getElementById('convertBtn');
  const convertStatus = document.getElementById('convertStatus');

  const badgeOriginal = document.getElementById('badgeOriginal');
  const badgeCurrent = document.getElementById('badgeCurrent');
  const downloadBtn = document.getElementById('downloadBtn');
  const previewFullBtn = document.getElementById('previewFullBtn');
  const startOver = document.getElementById('startOver');
  const chooseAnother = document.getElementById('chooseAnother');
  const navLinks = document.querySelectorAll('.navlinks [data-navtool]');
  let pendingNavTool = null;

  let originalFileSize = 0;
  let originalFileName = 'photo';
  let currentImage = null;
  let currentBlob = null;
  let aspectRatio = 1;
  let lockAspect = true;

  // ---------- tool pills ----------
  function activateTool(tool){
    document.querySelectorAll('.toolpills button').forEach(b=>b.classList.remove('active'));
    const pillBtn = document.querySelector('.toolpills button[data-tool="'+tool+'"]');
    if(pillBtn) pillBtn.classList.add('active');
    document.querySelectorAll('.tool-panel').forEach(p=>p.classList.remove('active'));
    const panel = document.querySelector('.tool-panel[data-panel="'+tool+'"]');
    if(panel) panel.classList.add('active');
    cropBox.style.display = (tool === 'crop') ? 'block' : 'none';

    navLinks.forEach(l=>l.classList.remove('current'));
    const navLink = document.querySelector('.navlinks [data-navtool="'+tool+'"]');
    if(navLink) navLink.classList.add('current');
  }

  document.querySelectorAll('.toolpills button').forEach(btn=>{
    btn.addEventListener('click', ()=>activateTool(btn.dataset.tool));
  });

  navLinks.forEach(link=>{
    link.addEventListener('click', ()=>{
      const tool = link.dataset.navtool;
      if(bench.classList.contains('active')){
        activateTool(tool);
        document.querySelector('.sidebar').scrollIntoView({behavior:'smooth', block:'start'});
      } else {
        // no photo yet — remember what they wanted, send them to the dropzone first
        pendingNavTool = tool;
        dropzone.scrollIntoView({behavior:'smooth', block:'center'});
        dropzone.style.borderColor = 'var(--blue)';
        dropzone.style.background = 'var(--blue-pale)';
        setTimeout(()=>{ dropzone.style.borderColor = ''; dropzone.style.background = ''; }, 900);
      }
    });
  });

  lockAspectBtn.addEventListener('click', ()=>{
    lockAspect = !lockAspect;
    lockAspectBtn.classList.toggle('on', lockAspect);
  });

  // resize sub-toggle
  document.querySelectorAll('[data-resizemode]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('[data-resizemode]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.resize-mode').forEach(p=>p.classList.remove('active'));
      document.querySelector('.resize-mode[data-mode="'+btn.dataset.resizemode+'"]').classList.add('active');
    });
  });

  // compress sub-toggle
  document.querySelectorAll('[data-compressmode]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('[data-compressmode]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.compress-mode').forEach(p=>p.classList.remove('active'));
      document.querySelector('.compress-mode[data-mode="'+btn.dataset.compressmode+'"]').classList.add('active');
      if(btn.dataset.compressmode === 'quality') refreshQualityEstimate();
    });
  });

  // ---------- helpers ----------
  function fmtBytes(bytes){
    if(bytes >= 1024*1024) return (bytes/(1024*1024)).toFixed(2)+' MB';
    return (bytes/1024).toFixed(1)+' KB';
  }

  function updateBadges(){
    if(currentImage){
      badgeOriginal.textContent = 'Original: ' + fmtBytes(originalFileSize);
      badgeCurrent.textContent = 'Current: ' + currentImage.naturalWidth + '×' + currentImage.naturalHeight + ' · ' + (currentBlob ? fmtBytes(currentBlob.size) : '—');
      widthInput.value = currentImage.naturalWidth;
      heightInput.value = currentImage.naturalHeight;
      aspectRatio = currentImage.naturalWidth / currentImage.naturalHeight;
    }
  }

  function setDownload(blob, ext){
    const url = URL.createObjectURL(blob);
    downloadBtn.href = url;
    downloadBtn.download = originalFileName + '-edited.' + ext;
  }

  function extFor(mime){
    if(mime === 'image/png') return 'png';
    if(mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  function imageToBlob(img, mime, quality){
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob)=>resolve(blob), mime, quality);
    });
  }

  function blobToImage(blob){
    return new Promise((resolve)=>{
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = ()=>{ resolve(img); };
      img.src = url;
    });
  }

  async function setCurrentFromCanvas(canvas, mime, quality){
    return new Promise((resolve)=>{
      canvas.toBlob(async (blob)=>{
        currentBlob = blob;
        currentImage = await blobToImage(blob);
        stageImg.src = currentImage.src;
        updateBadges();
        setDownload(blob, extFor(mime));
        resolve();
      }, mime || 'image/png', quality);
    });
  }

  // ---------- load file ----------
  function handleFile(file){
    if(!file || !file.type.startsWith('image/')) return;
    originalFileSize = file.size;
    originalFileName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        currentImage = img;
        currentBlob = file;
        stageImg.src = e.target.result;
        bench.classList.add('active');
        dropzone.style.display = 'none';
        updateBadges();
        setDownload(file, (file.type.split('/')[1] || 'jpg').replace('jpeg','jpg'));
        resetCropToFull();
        if(pendingNavTool){
          activateTool(pendingNavTool);
          pendingNavTool = null;
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  dropzone.addEventListener('click', ()=>fileInput.click());
  chooseAnother.addEventListener('click', ()=>fileInput.click());
  fileInput.addEventListener('change', (e)=>handleFile(e.target.files[0]));
  ['dragenter','dragover'].forEach(ev=>{
    dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave','drop'].forEach(ev=>{
    dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', (e)=>{
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  function resetAll(){
    bench.classList.remove('active');
    dropzone.style.display = 'block';
    fileInput.value = '';
    compressStatus.textContent = '';
  }
  startOver.addEventListener('click', (e)=>{ e.preventDefault(); resetAll(); });

  previewFullBtn.addEventListener('click', ()=>{
    if(!currentImage) return;
    window.open(currentImage.src, '_blank');
  });

  // ---------- presets ----------
  document.querySelectorAll('.preset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      widthInput.value = btn.dataset.w;
      heightInput.value = btn.dataset.h;
      activateTool('resize');
      document.querySelectorAll('[data-resizemode]').forEach(b=>b.classList.remove('active'));
      document.querySelector('[data-resizemode="dims"]').classList.add('active');
      document.querySelectorAll('.resize-mode').forEach(p=>p.classList.remove('active'));
      document.querySelector('.resize-mode[data-mode="dims"]').classList.add('active');
      applyResizeBtn.click();
    });
  });

  // ---------- crop box drag/resize (all corners + all edges) ----------
  let cropState = null;

  function resetCropToFull(){
    requestAnimationFrame(()=>{
      const rect = stageImg.getBoundingClientRect();
      const w = rect.width * 0.7;
      const h = rect.height * 0.7;
      cropBox.style.left = ((rect.width - w)/2) + 'px';
      cropBox.style.top = ((rect.height - h)/2) + 'px';
      cropBox.style.width = w + 'px';
      cropBox.style.height = h + 'px';
    });
  }
  resetCropBtn.addEventListener('click', resetCropToFull);

  function startDrag(e, mode){
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    cropState = {
      mode: mode,
      startX: point.clientX,
      startY: point.clientY,
      startLeft: cropBox.offsetLeft,
      startTop: cropBox.offsetTop,
      startW: cropBox.offsetWidth,
      startH: cropBox.offsetHeight,
      boundW: stageImg.getBoundingClientRect().width,
      boundH: stageImg.getBoundingClientRect().height
    };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', onDrag, {passive:false});
    window.addEventListener('touchend', endDrag);
  }

  function onDrag(e){
    if(!cropState) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - cropState.startX;
    const dy = point.clientY - cropState.startY;
    const { mode, startLeft, startTop, startW, startH, boundW, boundH } = cropState;
    const MIN = 24;

    if(mode === 'move'){
      let left = Math.min(Math.max(0, startLeft + dx), boundW - startW);
      let top = Math.min(Math.max(0, startTop + dy), boundH - startH);
      cropBox.style.left = left + 'px';
      cropBox.style.top = top + 'px';
      return;
    }

    let left = startLeft, top = startTop, w = startW, h = startH;
    if(mode.includes('r')) w = Math.min(Math.max(MIN, startW + dx), boundW - startLeft);
    if(mode.includes('l')) { w = Math.min(Math.max(MIN, startW - dx), startLeft + startW); left = startLeft + startW - w; }
    if(mode.includes('b')) h = Math.min(Math.max(MIN, startH + dy), boundH - startTop);
    if(mode.includes('t')) { h = Math.min(Math.max(MIN, startH - dy), startTop + startH); top = startTop + startH - h; }
    cropBox.style.left = left + 'px';
    cropBox.style.top = top + 'px';
    cropBox.style.width = w + 'px';
    cropBox.style.height = h + 'px';
  }

  function endDrag(){
    cropState = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('touchend', endDrag);
  }

  cropBox.addEventListener('mousedown', (e)=>{
    if(e.target.classList.contains('handle')) return;
    startDrag(e, 'move');
  });
  cropBox.addEventListener('touchstart', (e)=>{
    if(e.target.classList.contains('handle')) return;
    startDrag(e, 'move');
  }, {passive:false});

  // handle -> mode map: corners use two-letter (tl,tr,bl,br), edges use single letter (t,b,l,r)
  cropBox.querySelectorAll('.handle').forEach(handle=>{
    const classes = [...handle.classList];
    const mode = classes.find(c=>c!=='handle' && c!=='corner' && c!=='edge');
    handle.addEventListener('mousedown', (e)=>{ e.stopPropagation(); startDrag(e, mode); });
    handle.addEventListener('touchstart', (e)=>{ e.stopPropagation(); startDrag(e, mode); }, {passive:false});
  });

  applyCropBtn.addEventListener('click', async ()=>{
    if(!currentImage) return;
    const dispRect = stageImg.getBoundingClientRect();
    const scaleX = currentImage.naturalWidth / dispRect.width;
    const scaleY = currentImage.naturalHeight / dispRect.height;

    const cx = cropBox.offsetLeft * scaleX;
    const cy = cropBox.offsetTop * scaleY;
    const cw = cropBox.offsetWidth * scaleX;
    const ch = cropBox.offsetHeight * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cw);
    canvas.height = Math.round(ch);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);

    const mime = currentBlob && currentBlob.type ? currentBlob.type : 'image/png';
    await setCurrentFromCanvas(canvas, mime, 0.92);
    resetCropToFull();
  });

  // ---------- resize ----------
  widthInput.addEventListener('input', ()=>{
    if(lockAspect && aspectRatio){
      heightInput.value = Math.round(widthInput.value / aspectRatio);
    }
  });
  heightInput.addEventListener('input', ()=>{
    if(lockAspect && aspectRatio){
      widthInput.value = Math.round(heightInput.value * aspectRatio);
    }
  });

  applyResizeBtn.addEventListener('click', async ()=>{
    if(!currentImage) return;
    const w = parseInt(widthInput.value, 10);
    const h = parseInt(heightInput.value, 10);
    if(!w || !h || w < 1 || h < 1) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentImage, 0, 0, w, h);
    const mime = currentBlob && currentBlob.type ? currentBlob.type : 'image/png';
    await setCurrentFromCanvas(canvas, mime, 0.92);
    resetCropToFull();
  });

  // ---------- compress to target size ----------
  compressBtn.addEventListener('click', async ()=>{
    if(!currentImage) return;
    const targetKb = parseFloat(targetKbInput.value);
    if(!targetKb || targetKb <= 0){
      compressStatus.textContent = 'Enter a target size in KB first.';
      compressStatus.className = 'status-msg warn';
      return;
    }
    const targetBytes = targetKb * 1024;
    const mime = formatSelect.value;
    compressStatus.textContent = 'Compressing…';
    compressStatus.className = 'status-msg';
    compressBtn.disabled = true;

    try{
      if(mime === 'image/png'){
        const blob = await imageToBlob(currentImage, mime);
        if(blob.size > targetBytes){
          compressStatus.textContent = 'PNG is lossless and came out to ' + fmtBytes(blob.size) + ' — bigger than your target. Try JPEG or WebP, or resize down first.';
          compressStatus.className = 'status-msg warn';
        } else {
          compressStatus.textContent = 'Done — ' + fmtBytes(blob.size) + '.';
          compressStatus.className = 'status-msg ok';
        }
        currentBlob = blob;
        currentImage = await blobToImage(blob);
        stageImg.src = currentImage.src;
        updateBadges();
        setDownload(blob, 'png');
      } else {
        let lo = 0.02, hi = 0.98;
        let bestBlob = null;
        for(let i=0; i<8; i++){
          const mid = (lo + hi) / 2;
          const blob = await imageToBlob(currentImage, mime, mid);
          if(blob.size > targetBytes){
            hi = mid;
          } else {
            bestBlob = blob;
            lo = mid;
          }
        }
        if(!bestBlob){
          bestBlob = await imageToBlob(currentImage, mime, 0.02);
        }
        currentBlob = bestBlob;
        currentImage = await blobToImage(bestBlob);
        stageImg.src = currentImage.src;
        updateBadges();
        setDownload(bestBlob, extFor(mime));

        if(bestBlob.size <= targetBytes){
          compressStatus.textContent = 'Done — got it to ' + fmtBytes(bestBlob.size) + '.';
          compressStatus.className = 'status-msg ok';
        } else {
          compressStatus.textContent = 'Reached the lowest usable quality at ' + fmtBytes(bestBlob.size) + ' — smaller than that needs a resize too.';
          compressStatus.className = 'status-msg warn';
        }
      }
    } finally {
      compressBtn.disabled = false;
    }
  });

  // ---------- resize by percentage ----------
  pctSlider.addEventListener('input', ()=>{
    pctValue.textContent = pctSlider.value + '%';
    if(currentImage){
      const w = Math.round(currentImage.naturalWidth * pctSlider.value / 100);
      const h = Math.round(currentImage.naturalHeight * pctSlider.value / 100);
      pctReadout.innerHTML = 'New size: <strong>' + w + ' × ' + h + '</strong>';
    }
  });

  applyPctBtn.addEventListener('click', async ()=>{
    if(!currentImage) return;
    const pct = parseFloat(pctSlider.value);
    const w = Math.max(1, Math.round(currentImage.naturalWidth * pct / 100));
    const h = Math.max(1, Math.round(currentImage.naturalHeight * pct / 100));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentImage, 0, 0, w, h);
    const mime = currentBlob && currentBlob.type ? currentBlob.type : 'image/png';
    await setCurrentFromCanvas(canvas, mime, 0.92);
    pctSlider.value = 100;
    pctValue.textContent = '100%';
    pctReadout.textContent = 'New size: —';
    resetCropToFull();
  });

  // ---------- compress: quality slider (live estimate) ----------
  let qualityEstimateTimer = null;
  function refreshQualityEstimate(){
    if(!currentImage) return;
    clearTimeout(qualityEstimateTimer);
    qualityEstimateTimer = setTimeout(async ()=>{
      const mime = qualityFormatSelect.value;
      const q = parseInt(qualitySlider.value, 10) / 100;
      const blob = await imageToBlob(currentImage, mime, q);
      qualityReadout.innerHTML = 'Estimated size: <strong>' + fmtBytes(blob.size) + '</strong>';
    }, 150);
  }
  qualitySlider.addEventListener('input', ()=>{
    qualityValue.textContent = qualitySlider.value + '%';
    refreshQualityEstimate();
  });
  qualityFormatSelect.addEventListener('change', refreshQualityEstimate);

  applyQualityBtn.addEventListener('click', async ()=>{
    if(!currentImage) return;
    const mime = qualityFormatSelect.value;
    const q = parseInt(qualitySlider.value, 10) / 100;
    applyQualityBtn.disabled = true;
    try{
      const blob = await imageToBlob(currentImage, mime, q);
      currentBlob = blob;
      currentImage = await blobToImage(blob);
      stageImg.src = currentImage.src;
      updateBadges();
      setDownload(blob, extFor(mime));
      qualityReadout.innerHTML = 'Applied — now <strong>' + fmtBytes(blob.size) + '</strong>';
    } finally {
      applyQualityBtn.disabled = false;
    }
  });

  // ---------- convert format ----------
  function updateConvertQualityVisibility(){
    convertQualityRow.style.display = (convertFormat.value === 'image/png') ? 'none' : 'flex';
  }
  convertFormat.addEventListener('change', updateConvertQualityVisibility);
  convertQuality.addEventListener('input', ()=>{ convertQualityValue.textContent = convertQuality.value + '%'; });
  updateConvertQualityVisibility();

  convertBtn.addEventListener('click', async ()=>{
    if(!currentImage) return;
    const mime = convertFormat.value;
    const q = parseInt(convertQuality.value, 10) / 100;
    convertBtn.disabled = true;
    convertStatus.textContent = 'Converting…';
    convertStatus.className = 'status-msg';
    try{
      const blob = await imageToBlob(currentImage, mime, mime === 'image/png' ? undefined : q);
      currentBlob = blob;
      currentImage = await blobToImage(blob);
      stageImg.src = currentImage.src;
      updateBadges();
      const ext = extFor(mime);
      setDownload(blob, ext);
      convertStatus.textContent = 'Converted to ' + ext.toUpperCase() + ' — ' + fmtBytes(blob.size) + '. Ready to download.';
      convertStatus.className = 'status-msg ok';
    } finally {
      convertBtn.disabled = false;
    }
  });

})();
