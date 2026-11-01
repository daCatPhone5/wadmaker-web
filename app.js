const state = {
  wadBytes: null,
  originalFileName: '',
  assetList: [],
  selectedIcon: null,
};

const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const wadMagicEl = document.getElementById('wadMagic');
const titleIdEl = document.getElementById('titleId');
const assetListEl = document.getElementById('assetList');
const previewImageEl = document.getElementById('previewImage');
const previewEmptyEl = document.getElementById('previewEmpty');
const exportButton = document.getElementById('exportButton');

const wadInput = document.getElementById('wadInput');
const iconInput = document.getElementById('iconInput');

wadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parseResult = parseWad(bytes);

    state.wadBytes = bytes;
    state.originalFileName = file.name;
    state.assetList = parseResult.assets;
    state.selectedIcon = parseResult.assets[0] || null;

    renderMetadata(parseResult, file);
    renderAssets(parseResult.assets);
    renderSelectedPreview(parseResult.assets[0]);
    exportButton.disabled = false;
  } catch (error) {
    alert(error.message || 'Could not open WAD file.');
  }
});

iconInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file || !state.wadBytes) return;

  try {
    const pngBytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    if (!valid) {
      throw new Error('Please choose a PNG image.');
    }

    const selected = state.selectedIcon || state.assetList[0];
    if (!selected) {
      throw new Error('No image asset found inside the WAD.');
    }

    const replaced = replacePngWithinWad(state.wadBytes, selected.start, selected.size, pngBytes);
    state.wadBytes = replaced;
    renderSelectedPreview({ pngBytes: pngBytes });
  } catch (error) {
    alert(error.message || 'Could not replace the icon.');
  }
});

exportButton.addEventListener('click', () => {
  if (!state.wadBytes) return;

  const blob = new Blob([state.wadBytes], { type: 'application/octet-stream' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  const baseName = (state.originalFileName || 'wad-export').replace(/\.[^/.]+$/, '');
  link.download = `${baseName}-edited.wad`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
});

function parseWad(bytes) {
  if (bytes.length < 4) {
    throw new Error('This file is too small to be a Wii WAD.');
  }

  const magic = readAscii(bytes.slice(0, 4));
  const valid = ['WAD2', 'WAD1', 'WAD?'].includes(magic);
  if (!valid) {
    throw new Error('The file does not look like a valid Wii WAD.');
  }

  const assets = findPngAssets(bytes);
  const titleId = findTitleId(bytes) || 'Not found';

  return {
    magic,
    titleId,
    assets,
  };
}

function findTitleId(bytes) {
  const length = Math.min(bytes.length, 4096);
  const samples = [
    '00010000',
    '00010001',
    '00010002',
    '00010004',
    '00010005',
    '00010006',
    '00010007',
  ];

  for (const sample of samples) {
    const target = sample.split('').map((char) => char.charCodeAt(0));
    for (let i = 0; i <= length - target.length; i += 1) {
      let match = true;
      for (let j = 0; j < target.length; j += 1) {
        if (bytes[i + j] !== target[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return sample;
      }
    }
  }

  for (let i = 0; i < bytes.length - 8; i += 1) {
    const val = bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16) + (bytes[i + 3] << 24);
    if (val === 0x00010000 || val === 0x00010001 || val === 0x00010002) {
      const title = bytes.slice(i, i + 8).map((b) => b.toString(16).padStart(2, '0')).join('');
      return title.toUpperCase();
    }
  }

  return null;
}

function findPngAssets(bytes) {
  const results = [];
  for (let i = 0; i <= bytes.length - 8; i += 1) {
    if (
      bytes[i] === 0x89 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x47 &&
      bytes[i + 4] === 0x0d &&
      bytes[i + 5] === 0x0a &&
      bytes[i + 6] === 0x1a &&
      bytes[i + 7] === 0x0a
    ) {
      let pos = i + 8;
      let end = null;
      while (pos + 12 <= bytes.length) {
        const chunkLength = readU32BigEndian(bytes.slice(pos, pos + 4));
        const chunkType = readAscii(bytes.slice(pos + 4, pos + 8));
        pos += 8;

        if (chunkType === 'IEND') {
          end = pos + chunkLength + 4;
          break;
        }

        pos += chunkLength + 4;
      }

      if (end && end > i) {
        const pngBytes = bytes.slice(i, end);
        results.push({
          start: i,
          size: end - i,
          name: `embedded-image-${results.length + 1}.png`,
          pngBytes,
        });
      }
    }
  }

  return results;
}

function replacePngWithinWad(wadBytes, targetStart, targetSize, replacementPng) {
  const out = new Uint8Array(wadBytes.length);
  out.set(wadBytes.slice(0, targetStart), 0);

  const safeReplacement = new Uint8Array(targetSize);
  safeReplacement.set(replacementPng.slice(0, targetSize), 0);
  out.set(safeReplacement, targetStart);

  const remainingOffset = targetStart + targetSize;
  out.set(wadBytes.slice(remainingOffset), remainingOffset);

  return out;
}

function renderMetadata(parseResult, file) {
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  wadMagicEl.textContent = parseResult.magic;
  titleIdEl.textContent = parseResult.titleId;
}

function renderAssets(assets) {
  if (!assets.length) {
    assetListEl.className = 'asset-list empty-state';
    assetListEl.textContent = 'No PNG assets found in this WAD file.';
    return;
  }

  assetListEl.className = 'asset-list';
  assetListEl.innerHTML = assets
    .map((asset, index) => {
      const thumbURL = makeObjectUrl(asset.pngBytes);
      return `
        <button class="asset-card" data-index="${index}" type="button" aria-label="Select ${asset.name}">
          <img class="asset-thumb" src="${thumbURL}" alt="${asset.name}" />
          <div class="asset-meta">
            <span class="asset-name">${asset.name}</span>
            <span class="asset-size">${formatBytes(asset.size)}</span>
          </div>
        </button>
      `;
    })
    .join('');

  assetListEl.querySelectorAll('.asset-card').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const selectedAsset = assets[index];
      if (!selectedAsset) return;
      state.selectedIcon = selectedAsset;
      renderSelectedPreview(selectedAsset);
    });
  });
}

function renderSelectedPreview(asset) {
  if (!asset) {
    previewImageEl.style.display = 'none';
    previewEmptyEl.style.display = 'block';
    return;
  }

  const source = asset.pngBytes || asset;
  const objectUrl = makeObjectUrl(source);
  previewImageEl.src = objectUrl;
  previewImageEl.style.display = 'block';
  previewEmptyEl.style.display = 'none';
}

function makeObjectUrl(bytes) {
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

function readAscii(bytes) {
  return Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .replace(/\u0000+$/, '');
}

function readU32BigEndian(chunk) {
  return (
    (chunk[0] << 24) |
    (chunk[1] << 16) |
    (chunk[2] << 8) |
    chunk[3]
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


