// Initialized in workspace.html: const PROJECT_ID = ...

const editor = new Editor('c');
let currentImage = null;
let projectClasses = [];

class Workspace {
    constructor() {
        this.init();
        this.imageList = [];
    }

    async init() {
        // 1. Get Project Details (for classes)
        // Since we don't have a direct "get project by id" fully exposed with classes in FE easily yet,
        // let's fetch images first which serves similar purpose, but better to fix classes loading.
        // We actually need classes list.
        // Let's assume we can fetch classes or extract them.
        // For now, I'll fetch images, and maybe I need an endpoint for classes?
        // Wait, models.py: Project has classes_path.
        // I need an endpoint to get class names.

        // QUICK FIX: Let's add a quick way to get classes or just infer them?
        // No, UI needs list.
        // I'll fetch images first.

        await this.loadProjectInfo();
        await loadImages();

        // Hotkeys
        document.addEventListener('keydown', (e) => {
            // Ignore hotkeys if typing in an input text field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'q') {
                editor.deleteSelected();
            }
            if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.save();
            }
            if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                editor.duplicateSelected();
            } else if (e.key.toLowerCase() === 'd') {
                // Single D for Draw Mode
                editor.setMode('draw');
            }
            if (e.key.toLowerCase() === 'v') editor.setMode('select');
            if (e.key.toLowerCase() === 'f') this.toggleFlag();
            if (e.key.toLowerCase() === 'l') this.toggleLockBox();
            if (e.key.toLowerCase() === 'h') this.toggleImageVisibility();
            if (e.key.toLowerCase() === 'i') this.toggleIsolateMode();

            if (e.key.toLowerCase() === 'i') this.toggleIsolateMode();
            if (e.key.toLowerCase() === 'a') editor.toggleStickyMove();

            // Class Hotkeys (0-9)
            if (e.key >= '0' && e.key <= '9') {
                const idx = parseInt(e.key);
                if (idx < projectClasses.length) {
                    const el = document.querySelectorAll('.class-item')[idx];
                    selectClass(idx, el);
                }
            }

            // Shortcuts Overlay
            if (e.key === '`' || e.key === '~') {
                e.preventDefault(); // Prevent typing `
                const modal = document.getElementById('shortcutsModal');
                if (modal) modal.classList.toggle('hidden');
            }
            if (e.key === 'Escape') {
                const modal = document.getElementById('shortcutsModal');
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    return; // Stop other esc actions if modal was open?
                }
            }

            // Undo/Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    editor.redo();
                } else {
                    editor.undo();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                editor.redo();
            }
        });
    }

    async loadProjectInfo() {
        try {
            const res = await fetch(`/api/projects/${PROJECT_ID}/classes`);
            projectClasses = await res.json();
            if (!projectClasses || projectClasses.length === 0) {
                // Fallback if empty or failed
                projectClasses = ['Class 0', 'Class 1', 'Class 2', 'Class 3', 'Class 4'];
            }
        } catch (e) {
            console.error(e);
            projectClasses = ['Error Loading Classes'];
        }
        this.renderClasses();
    }

    renderClasses() {
        const container = document.getElementById('classList');
        container.innerHTML = projectClasses.map((cls, idx) => `
            <div class="class-item px-4 py-3 cursor-pointer border-b border-border flex justify-between items-center text-sm hover:bg-panel transition-colors bg-surface text-content-muted group" 
                 onclick="selectClass(${idx}, this)">
                <div class="flex items-center gap-3 overflow-hidden">
                     <div class="w-3 h-3 rounded-full shadow-sm flex-shrink-0" style="background-color: ${editor.colors[idx % 20]}"></div>
                     <span class="truncate group-hover:text-content transition-colors" title="${cls}">${cls}</span>
                </div>
            </div>
        `).join('');
        editor.setClasses(projectClasses);
    }

    async selectImage(image) {
        currentImage = image;
        document.getElementById('currentFileName').textContent = image.filename;

        // Update Active Item in List
        document.querySelectorAll('.image-item').forEach(el => {
            el.classList.remove('bg-panel', 'border-l-2', 'border-primary', 'text-primary');
            el.classList.add('bg-surface', 'text-content-muted');
        });
        const el = document.getElementById(`img-${image.id}`);
        if (el) {
            el.classList.remove('bg-surface', 'text-content-muted');
            el.classList.add('bg-panel', 'border-l-2', 'border-primary', 'text-primary');
        }

        // Update Flag Button
        this.updateFlagButton();

        // Load into Canvas
        // Image URL: We need a route to serve the raw image.
        // Does Flask `static` serve the root_path? No.
        // We need a route `/api/serve_image/<id>`?
        // Or just serve from a symlink?
        // Best approach: Add endpoint in `routes.py` to serve image bytes.

        // I will add `/api/image_data/<id>` in routes.
        const url = `/api/image_data/${image.id}`;

        // For Image Size, we let Fabric load it.
        // But we need to know size for YOLO conversion? Fabric keeps track.

        // Wait, Fabric Image.fromURL loads the image.
        editor.canvas.clear();

        // 1. Get Labels first?
        const labels = await API.getLabel(image.id);

        // 2. Load Image
        // We need to fetch image dimensions first or let Fabric handle it.
        // Fabric handles it.

        fabric.Image.fromURL(url, (img) => {
            if (!img) { alert('Failed to load image'); return; }
            editor.loadImage(img);
            editor.loadBoxes(labels);

            // Update Inspection View with Image Metadata
            this.updateImageStats(img, labels.length);
        });
    }

    updateImageStats(img, boxCount) {
        const magCanvas = document.getElementById('magnifierCanvas');
        const magPlaceholder = document.getElementById('magPlaceholder');
        if (magCanvas) magCanvas.style.display = 'none';
        if (magPlaceholder) {
            magPlaceholder.style.display = 'flex';
            magPlaceholder.querySelector('span').textContent = 'Select a box to zoom';
        }

        document.getElementById('selectionInfo').innerHTML = `
            <div class="mb-2">
                <label class="block text-xs text-gray-500 mb-0.5 uppercase tracking-wider">Resolution</label>
                <span class="text-sm font-medium text-gray-300 font-mono">${img.width} x ${img.height}</span>
            </div>
            <div class="mb-2">
                <label class="block text-xs text-gray-500 mb-0.5 uppercase tracking-wider">Total Boxes</label>
                <span class="text-sm font-medium text-gray-300 font-mono">${boxCount}</span>
            </div>
            <p class="text-xs text-gray-600 mt-2 italic">Select a box for details</p>
        `;
    }

    toggleFlag() {
        if (!currentImage) return;
        currentImage.flag_status = (currentImage.flag_status === 'Flagged') ? 'Normal' : 'Flagged';
        this.updateFlagButton();
        this.save(true); // Auto save status

        // Update list icon
        const el = document.getElementById(`img-${currentImage.id}`);
        if (el) {
            // Re-render essentially or just toggle icon class? Easier to just reload list or toggle specific classes?
            // Since we use Tailwind, "flagged" class isn't defined. We must update DOM manually or re-render.
            // Let's just find the flag icon and toggle it.
            const iconContainer = el.querySelector('.flex.items-center.gap-2');
            if (currentImage.flag_status === 'Flagged') {
                if (!iconContainer.querySelector('.fa-flag')) {
                    iconContainer.insertAdjacentHTML('afterbegin', '<i class="fa-solid fa-flag text-red-500"></i>');
                }
            } else {
                const flag = iconContainer.querySelector('.fa-flag');
                if (flag) flag.remove();
            }
        }
    }

    updateFlagButton() {
        const btn = document.getElementById('btnFlag');
        if (currentImage.flag_status === 'Flagged') {
            btn.classList.add('text-red-500');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.remove('text-red-500');
            btn.classList.add('text-gray-400');
        }
    }

    toggleLockBox() {
        if (typeof editor !== 'undefined') editor.toggleLockBox();
    }

    toggleImageVisibility() {
        if (typeof editor !== 'undefined') editor.toggleImageVisibility();
    }

    toggleIsolateMode() {
        if (typeof editor !== 'undefined') editor.toggleIsolateMode();
    }

    async save(silent = false) {
        if (!currentImage) return;

        const boxes = editor.getBoxesYOLO();

        const data = {
            image_id: currentImage.id,
            labels: boxes,
            flag_status: currentImage.flag_status
        };

        await API.saveLabel(data);
        if (!silent) {
            // Flash button or something?
            const btn = document.querySelector('.btn-primary'); // Saved btn
            const originalText = btn.textContent;
            btn.textContent = 'Saved!';
            setTimeout(() => btn.textContent = originalText, 1000);
        }
    }

    async autoLabel() {
        if (!currentImage) return;

        const btn = document.querySelector('button[title="Auto Label (Magic Wand)"]');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const data = await API.autoLabel(currentImage.id);
            if (data.success) {
                if (data.boxes.length > 0) {
                    editor.loadBoxes(data.boxes);
                }
            }
        } catch (e) {
            alert(e.message);
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }

    openExportModal() {
        document.getElementById('exportModal').classList.remove('hidden');
    }

    async executeExport() {
        const scope = document.getElementById('exportScope').value;
        const excludeFlagged = document.getElementById('exportExcludeFlagged').checked;
        const splitRatio = parseFloat(document.getElementById('exportSplit').value);
        const format = document.getElementById('exportFormat').value;

        const criteria = {};

        if (scope === 'project') {
            criteria.project_ids = [PROJECT_ID];
        } else if (scope === 'view') {
            const viewVal = document.getElementById('viewFilter').value;
            if (!viewVal) {
                alert('Please select a specific View in the sidebar filter to export by View.');
                return;
            }
            // Mock View ID for now as per loadImages logic
            criteria.view_id = 999;
        } else if (scope === 'current') {
            if (!currentImage) {
                alert('No image selected.');
                return;
            }
            criteria.image_ids = [currentImage.id];
        }

        if (excludeFlagged) {
            criteria.exclude_flagged = true;
        }

        const btn = document.querySelector('#exportModal button:last-child');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...criteria,
                    split_ratio: splitRatio,
                    format: format
                })
            });
            const result = await res.json();

            if (result.status === 'success') {
                alert(`Export Successful!\nPath: ${result.export_path}\nTotal: ${result.stats.total} (Train: ${result.stats.train}, Val: ${result.stats.val})`);
                closeModal('exportModal');
            } else {
                alert('Export Failed: ' + result.message);
            }
        } catch (e) {
            alert('Error: ' + e.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

const currentWorkspace = new Workspace();

async function loadImages() {
    const view = document.getElementById('viewFilter').value;
    const flag = document.getElementById('flagFilter').value;

    const filters = { project_id: PROJECT_ID };
    if (view) filters.view_id = 999; // TODO: Real user ID? For now "My View" might be a specific ID convention or filtered by cookie. 
    // SRS says "View cho Minh", "View cho Tuan". 
    // We haven't implemented User Auth. So "My View" is ambiguous?
    // Let's assume "My View" means "View ID assigned to me in local storage" or just list all views?
    // SRS: "Bộ lọc View: [ All Images | My View | Flagged Only ]".
    // I will mock "My View" for now.

    if (flag) filters.flag_status = flag;

    const images = await API.getImages(filters);
    const container = document.getElementById('imageList');

    container.innerHTML = images.map(img => `
        <div class="px-4 py-3 cursor-pointer border-b border-border flex justify-between items-center text-sm hover:bg-panel transition-colors bg-surface text-content-muted image-item" 
             id="img-${img.id}" 
             onclick="currentWorkspace.selectImage({id: ${img.id}, filename: '${img.filename}', flag_status: '${img.flag_status}'})">
            <span class="truncate pr-2 flex-1" title="${img.filename}">${img.filename}</span>
            <div class="flex items-center gap-2">
                ${img.flag_status === 'Flagged' ? '<i class="fa-solid fa-flag text-red-500"></i>' : ''}
                ${img.is_labeled ? '<i class="fa-solid fa-check text-secondary"></i>' : '<i class="fa-regular fa-circle text-content-muted"></i>'}
            </div>
        </div>
    `).join('');

    currentWorkspace.imageList = images;
}

function selectClass(id, el) {
    editor.setActiveClass(id);
    document.querySelectorAll('.class-item').forEach(e => {
        e.classList.remove('bg-panel', 'border-l-2', 'border-primary', 'text-primary');
        e.classList.add('bg-surface', 'text-content-muted', 'border-border');
    });

    // Logic to select element 
    let target = el;
    if (!target) {
        target = document.querySelectorAll('.class-item')[id];
    }

    if (target) {
        target.classList.remove('bg-surface', 'text-content-muted', 'border-border');
        target.classList.add('bg-panel', 'border-l-2', 'border-primary', 'text-primary');
    }

    // Auto-switch to Draw Mode ONLY if no object is selected
    if (typeof editor !== 'undefined') {
        const active = editor.canvas.getActiveObject();
        if (!active) {
            editor.setMode('draw');
        } else {
            // If there IS a selection, we updated the class (via setActiveClass above), 
            // but we should probably KEEP the selection and NOT go to draw mode.
            // editor.setMode('select'); // It should already be in select mode if objects are selected.
        }
    }
}

function openAssignModal() {
    document.getElementById('assignModal').classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

document.getElementById('assignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());

    // 1. Create View
    const viewRes = await API.createView({ name: data.view_name, project_id: data.project_id });

    // 2. Assign
    const assignData = {
        view_id: viewRes.id,
        count: data.count,
        project_id: data.project_id
    };

    const res = await API.assignView(assignData);
    alert(res.message);
    document.getElementById('assignModal').classList.add('hidden');
    loadImages();
});

// Search Filter
document.getElementById('classSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.class-item');
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
    });
});
