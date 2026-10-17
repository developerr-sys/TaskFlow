// State variables
let tasks = [];
let currentFilter = 'all';
let searchQuery = '';
let toastTimer = null;
let renderedIds = new Set(); // tracks which task cards were already on screen (animation control)

// DOM Elements
const taskInput = document.getElementById('task-input');
const taskPriority = document.getElementById('task-priority');
const addTaskBtn = document.getElementById('add-task-btn');
const validationMsg = document.getElementById('validation-msg');
const searchInput = document.getElementById('search-input');
const filterButtons = document.querySelectorAll('.btn-filter');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const totalTasksEl = document.getElementById('total-tasks');
const activeTasksEl = document.getElementById('active-tasks');
const completedTasksEl = document.getElementById('completed-tasks');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const toast = document.getElementById('toast');
const themeOptions = document.querySelectorAll('.theme-option');
const emptyTitle = document.getElementById('empty-title');
const emptyDesc = document.getElementById('empty-desc');

// Category, Due Date, Sort, and Progress Elements
const taskCategory = document.getElementById('task-category');
const taskDate = document.getElementById('task-date');
const sortSelect = document.getElementById('sort-select');
const progressRingFill = document.getElementById('progress-ring-fill');
const progressPercent = document.getElementById('progress-percent');
const currentDateEl = document.getElementById('current-date');

// Progress ring geometry (matches r="52" in the SVG)
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Category display labels
const CATEGORY_EMOJI = { work: '💼 Work', personal: '🏠 Personal', health: '💪 Health', finance: '💰 Finance', other: '✨ Other' };

// Custom Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

// Theme icons / properties are styled in CSS using variables

let modalResolver = null;

// ==========================================
// CUSTOM MODAL CONFIRM SYSTEM
// ==========================================

function showConfirm(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmModal.classList.remove('hidden');
    // Trigger browser layout pass for css transition
    confirmModal.offsetHeight;
    confirmModal.classList.add('show');

    return new Promise((resolve) => {
        modalResolver = resolve;
    });
}

function hideConfirm(result) {
    confirmModal.classList.remove('show');
    setTimeout(() => {
        confirmModal.classList.add('hidden');
        if (modalResolver) {
            modalResolver(result);
            modalResolver = null;
        }
    }, 250);
}

modalConfirmBtn.addEventListener('click', () => hideConfirm(true));
modalCancelBtn.addEventListener('click', () => hideConfirm(false));
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) hideConfirm(false);
});
// Allow dismissing the modal with the Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal.classList.contains('show')) {
        hideConfirm(false);
    }
});

// ==========================================
// LOCAL STORAGE FUNCTIONS
// ==========================================

function loadTasks() {
    // Guard against corrupted localStorage data crashing the app on startup
    try {
        const storedTasks = localStorage.getItem('todoTasks');
        const parsed = storedTasks ? JSON.parse(storedTasks) : null;
        if (Array.isArray(parsed)) {
            tasks = parsed;
        }
    } catch (err) {
        console.warn('Corrupted task data in localStorage; starting with an empty list.', err);
        tasks = [];
    }
}

function saveTasks() {
    localStorage.setItem('todoTasks', JSON.stringify(tasks));
}

// ==========================================
// CORE TASK FUNCTIONS
// ==========================================

function addTask() {
    const title = taskInput.value.trim();

    if (title === '') {
        validationMsg.textContent = 'Please enter a task.';
        return;
    }

    validationMsg.textContent = '';

    const newTask = {
        id: Date.now().toString(),
        title: title,
        completed: false,
        priority: taskPriority.value,
        category: taskCategory.value,
        dueDate: taskDate.value || null,
        createdAt: new Date().toISOString(),
        updatedAt: null
    };

    tasks.push(newTask);
    saveTasks();
    
    // Reset Form Fields
    taskInput.value = '';
    taskDate.value = '';
    taskPriority.value = 'medium';
    taskCategory.value = 'Work';
    
    renderTasks();
    showNotification('Task added successfully.');
}

async function deleteTask(id) {
    const confirmDelete = await showConfirm('Delete Task', 'Are you sure you want to delete this task? This action cannot be undone.');
    if (confirmDelete) {
        tasks = tasks.filter(task => task.id !== id);
        saveTasks();
        renderTasks();
        showNotification('Task deleted.');
    }
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
    }
}

function editTask(id) {
    const taskItem = document.querySelector(`[data-id="${id}"]`);
    const titleSpan = taskItem.querySelector('.task-title');
    const currentTitle = titleSpan.textContent;

    // Create input for editing
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.value = currentTitle;
    editInput.className = 'edit-input';

    // Replace span with input
    titleSpan.replaceWith(editInput);
    editInput.focus();
    editInput.select();

    // Save or Cancel on Enter/Blur/Escape
    const saveChanges = () => {
        const newTitle = editInput.value.trim();
        if (newTitle === '') {
            showNotification('Task title cannot be empty.');
            editInput.focus();
            return;
        }
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.title = newTitle;
            task.updatedAt = new Date().toISOString();
            saveTasks();
        }
        renderTasks();
        showNotification('Task updated.');
    };

    const cancelEdit = () => {
        renderTasks();
    };

    editInput.addEventListener('blur', saveChanges);
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            editInput.removeEventListener('blur', saveChanges);
            saveChanges();
        } else if (e.key === 'Escape') {
            editInput.removeEventListener('blur', saveChanges);
            cancelEdit();
        }
    });
}

async function clearCompleted() {
    const completedTasks = tasks.filter(task => task.completed);
    if (completedTasks.length === 0) {
        showNotification('No completed tasks to clear.');
        return;
    }

    const confirmClear = await showConfirm('Clear Completed', `Are you sure you want to clear all ${completedTasks.length} completed task(s)?`);
    if (confirmClear) {
        tasks = tasks.filter(task => !task.completed);
        saveTasks();
        renderTasks();
        showNotification('Completed tasks cleared.');
    }
}

// ==========================================
// RENDERING & UI FUNCTIONS
// ==========================================

function renderTasks() {
    taskList.innerHTML = '';

    let filteredTasks = [...tasks];

    // Apply Filter
    if (currentFilter === 'active') {
        filteredTasks = filteredTasks.filter(task => !task.completed);
    } else if (currentFilter === 'completed') {
        filteredTasks = filteredTasks.filter(task => task.completed);
    }

    // Apply Search
    if (searchQuery !== '') {
        filteredTasks = filteredTasks.filter(task =>
            task.title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }

    // Apply Sorting
    const sortVal = sortSelect.value;
    filteredTasks.sort((a, b) => {
        if (sortVal === 'newest') {
            return b.createdAt.localeCompare(a.createdAt);
        } else if (sortVal === 'oldest') {
            return a.createdAt.localeCompare(b.createdAt);
        } else if (sortVal === 'priority-desc' || sortVal === 'priority-asc') {
            const weights = { low: 1, medium: 2, high: 3 };
            const weightA = weights[a.priority] || 2;
            const weightB = weights[b.priority] || 2;
            // Tie-break by creation time so equal priorities stay in a stable order
            if (weightA !== weightB) {
                return sortVal === 'priority-desc' ? weightB - weightA : weightA - weightB;
            }
            return b.createdAt.localeCompare(a.createdAt);
        } else if (sortVal === 'due-soon') {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return parseLocalDate(a.dueDate) - parseLocalDate(b.dueDate);
        }
        return 0;
    });

    // Handle empty state with context-aware messaging
    if (filteredTasks.length === 0) {
        if (searchQuery !== '') {
            emptyTitle.textContent = 'No matches found';
            emptyDesc.textContent = `No tasks match "${searchQuery}". Try a different search term.`;
        } else if (currentFilter === 'active') {
            emptyTitle.textContent = 'Nothing active';
            emptyDesc.textContent = 'All your tasks are completed. Great job!';
        } else if (currentFilter === 'completed') {
            emptyTitle.textContent = 'Nothing completed yet';
            emptyDesc.textContent = 'Tick a task checkbox to mark it as done.';
        } else {
            emptyTitle.textContent = 'All caught up!';
            emptyDesc.textContent = 'No tasks yet. Add a new task to get started.';
        }
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    // Render tasks safely
    const currentIds = new Set();
    filteredTasks.forEach(task => {
        currentIds.add(task.id);

        const li = document.createElement('li');
        // Only animate cards that are genuinely new, not every re-render
        const isNew = !renderedIds.has(task.id);
        li.className = `task-item prio-${task.priority}${task.completed ? ' completed' : ''}${isNew ? ' task-new' : ''}`;
        li.dataset.id = task.id;

        // Custom Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.setAttribute('aria-label', `Mark ${task.title} as complete`);
        checkbox.addEventListener('change', () => toggleTask(task.id));

        // Details Container
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'task-details';

        // Badges Row
        const badgesDiv = document.createElement('div');
        badgesDiv.className = 'task-badges';

        const prioritySpan = document.createElement('span');
        prioritySpan.className = `priority-badge priority-${task.priority}`;
        prioritySpan.textContent = task.priority;
        badgesDiv.appendChild(prioritySpan);

        const categorySpan = document.createElement('span');
        const category = task.category || 'Other';
        categorySpan.className = `category-badge category-${category.toLowerCase()}`;
        categorySpan.textContent = CATEGORY_EMOJI[category.toLowerCase()] || `✨ ${category}`;
        badgesDiv.appendChild(categorySpan);

        detailsDiv.appendChild(badgesDiv);

        // Title
        const titleSpan = document.createElement('span');
        titleSpan.className = 'task-title';
        titleSpan.textContent = task.title;
        detailsDiv.appendChild(titleSpan);

        // Meta deadlines & timestamps
        const metaDiv = document.createElement('div');
        metaDiv.className = 'task-meta-info';

        const createdSpan = document.createElement('span');
        createdSpan.className = 'task-meta';
        const createdDate = new Date(task.createdAt).toLocaleDateString();
        createdSpan.textContent = `Created: ${createdDate}`;
        metaDiv.appendChild(createdSpan);

        if (task.dueDate) {
            const dueSpan = document.createElement('span');
            dueSpan.className = 'meta-due-date';

            // Parse date-only strings as LOCAL midnight to avoid timezone drift
            const dueDateObj = parseLocalDate(task.dueDate);
            const formattedDueDate = dueDateObj.toLocaleDateString();
            dueSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> Due: ${formattedDueDate}`;

            // Check if Overdue
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (dueDateObj < today && !task.completed) {
                dueSpan.classList.add('overdue');
                dueSpan.innerHTML = `⚠️ Overdue: ${formattedDueDate}`;
            }
            metaDiv.appendChild(dueSpan);
        }
        
        detailsDiv.appendChild(metaDiv);

        // Action Buttons (Edit/Delete)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'task-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-action btn-edit';
        editBtn.setAttribute('aria-label', 'Edit task');
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
        editBtn.addEventListener('click', () => editTask(task.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-action btn-delete';
        deleteBtn.setAttribute('aria-label', 'Delete task');
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
        deleteBtn.addEventListener('click', () => deleteTask(task.id));

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);

        li.appendChild(checkbox);
        li.appendChild(detailsDiv);
        li.appendChild(actionsDiv);

        taskList.appendChild(li);
    });

    // Remember which cards are on screen for next render
    renderedIds = currentIds;

    updateStats();
}

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;

    totalTasksEl.textContent = total;
    activeTasksEl.textContent = active;
    completedTasksEl.textContent = completed;

    // Calculate and update completion ring
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    progressRingFill.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    progressRingFill.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - percentage / 100)}`;
    progressPercent.textContent = `${percentage}%`;
}

function showNotification(message) {
    toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg> <span>${message}</span>`;
    toast.classList.add('show');

    // Reset the previous timer so a new message is never hidden early
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ==========================================
// EVENT LISTENERS
// ==========================================

addTaskBtn.addEventListener('click', addTask);

taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
});

searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTasks();
});

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTasks();
    });
});

clearCompletedBtn.addEventListener('click', clearCompleted);
sortSelect.addEventListener('change', renderTasks);

// Theme swatch selection
themeOptions.forEach(option => {
    option.addEventListener('click', () => {
        const theme = option.dataset.theme;
        setTheme(theme);
    });
});

function setTheme(theme, notify = true) {
    // Remove existing themes
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-emerald', 'theme-sunset', 'theme-ocean', 'theme-dusk', 'theme-autumn');
    
    // Add selected theme
    document.body.classList.add(`theme-${theme}`);
    
    // Highlight active swatch
    themeOptions.forEach(option => {
        option.classList.toggle('active', option.dataset.theme === theme);
    });
    
    // Save to local storage
    localStorage.setItem('appTheme', theme);
    
    // Display confirmation notification (skipped on initial page load)
    if (notify) {
        showNotification(`Theme changed to ${theme.charAt(0).toUpperCase() + theme.slice(1)}.`);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

function init() {
    // Display today's date in the sidebar
    if (currentDateEl) {
        currentDateEl.textContent = new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    }

    // Load saved theme preference silently on startup
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    setTheme(savedTheme, false);

    // Load tasks from local storage
    loadTasks();
    // Seed sample tasks only on the very first visit (never resurrect them
    // once the user has deliberately deleted everything)
    if (tasks.length === 0 && !localStorage.getItem('appSeeded')) {
        const base = Date.now();
        const makeId = (i) => (base + i).toString();

        const sampleTasks = [
            {
                id: makeId(1),
                title: 'Finish internship task',
                completed: false,
                priority: 'high',
                category: 'Work',
                dueDate: isoDateOffset(2),
                createdAt: new Date(base + 1).toISOString(),
                updatedAt: null
            },
            {
                id: makeId(2),
                title: 'Buy groceries',
                completed: false,
                priority: 'medium',
                category: 'Personal',
                dueDate: isoDateOffset(4),
                createdAt: new Date(base + 2).toISOString(),
                updatedAt: null
            },
            {
                id: makeId(3),
                title: 'Go for a 30-minute run',
                completed: true,
                priority: 'low',
                category: 'Health',
                dueDate: null,
                createdAt: new Date(base + 3).toISOString(),
                updatedAt: null
            },
            {
                id: makeId(4),
                title: 'Pay monthly bills',
                completed: false,
                priority: 'high',
                category: 'Finance',
                dueDate: isoDateOffset(7),
                createdAt: new Date(base + 4).toISOString(),
                updatedAt: null
            }
        ];

        tasks = sampleTasks;
        saveTasks();
        localStorage.setItem('appSeeded', 'true');
    }

    renderTasks();
}

// Helper: parse a YYYY-MM-DD string as a LOCAL date (avoids UTC off-by-one)
function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Helper: return local YYYY-MM-DD for `n` days from today
function isoDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Start the application
init();