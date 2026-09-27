const { createApp, ref, computed, onMounted } = Vue;

const CSV_COLUMNS = [
    "Назва", "Автор(ка)", "Мова", "Формат", "Стан", 
    "Наявність", "Статус", "Жанр", "Серія", "Частина серії", 
    "Місяць прочитання", "Прогрес", "Кількість сторінок", "%", "Оцінка"
];

function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let isDataStarted = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Skip non-book lines based on some heuristics
        if (line.includes("МІЙ КНИЖКОВИЙ") || line.includes("ТРЕКЕР ПРОЧИТАНОГО")) {
            break; // Stop parsing when we hit the stats tables
        }

        const values = parseCSVLine(line);
        
        // Find header
        if (!isDataStarted && values[0] === "Назва") {
            isDataStarted = true;
            continue;
        }

        if (isDataStarted) {
            // Check for empty or invalid rows (like #DIV/0!)
            if (values.every(v => !v || v === '#DIV/0!')) continue;
            
            if (values.length >= 13) {
                result.push({
                    title: values[0]?.trim(),
                    author: values[1]?.trim(),
                    language: values[2]?.trim(),
                    format: values[3]?.trim(),
                    state: values[4]?.trim(),
                    availability: values[5]?.trim(),
                    status: values[6]?.trim(),
                    genre: values[7]?.trim(),
                    series: values[8]?.trim(),
                    seriesPart: values[9]?.trim(),
                    month: values[10]?.trim(),
                    progress: parseInt(values[11]) || 0,
                    pageCount: parseInt(values[12]) || 0,
                    rating: values[14]?.trim() || ''
                });
            }
        }
    }
    return result;
}

// Handles quotes in CSV
function parseCSVLine(text) {
    let result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '"' && text[i+1] === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function generateCSV(books) {
    let csvContent = "\uFEFF"; // BOM for excel utf-8
    csvContent += CSV_COLUMNS.join(",") + "\n";
    
    books.forEach(b => {
        let percentage = 0;
        if (b.pageCount > 0) {
            percentage = (b.progress / b.pageCount) * 100;
            // Limit to max 100 and clean decimal
            percentage = Math.min(100, percentage);
            // Format number (Excel uses comma for decimals in some regions, but standard CSV uses dot)
            // Original CSV uses dots e.g., 22.77039848
        }
        
        const row = [
            escapeCSV(b.title),
            escapeCSV(b.author),
            escapeCSV(b.language),
            escapeCSV(b.format),
            escapeCSV(b.state),
            escapeCSV(b.availability),
            escapeCSV(b.status),
            escapeCSV(b.genre),
            escapeCSV(b.series),
            escapeCSV(b.seriesPart),
            escapeCSV(b.month),
            b.progress,
            b.pageCount,
            percentage > 0 ? percentage : 0,
            escapeCSV(b.rating)
        ];
        csvContent += row.join(",") + "\n";
    });
    return csvContent;
}

function escapeCSV(str) {
    if (str === null || str === undefined) return "";
    str = String(str).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

createApp({
    setup() {
        const books = ref([]);
        const showModal = ref(false);
        const editingIndex = ref(-1);
        const currentBook = ref({});

        // Load from LocalStorage on mount
        onMounted(() => {
            const saved = localStorage.getItem('book_diary');
            if (saved) {
                try {
                    books.value = JSON.parse(saved);
                } catch (e) {
                    console.error("Local storage error", e);
                }
            }
        });

        const saveToLocal = () => {
            localStorage.setItem('book_diary', JSON.stringify(books.value));
        };

        const triggerFileInput = () => {
            document.getElementById('csvFileInput').click();
        };

        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                books.value = parseCSV(text);
                saveToLocal();
                alert("Успішно імпортовано!");
            };
            reader.readAsText(file);
            event.target.value = ''; // reset
        };

        const exportCSV = () => {
            if (books.value.length === 0) {
                alert("Немає даних для експорту.");
                return;
            }
            const csvData = generateCSV(books.value);
            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "reading_diary.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        const statusColor = (status) => {
            if (status === 'Завершена') return 'bg-green-500';
            if (status === 'Читаю') return 'bg-yellow-400';
            return 'bg-gray-400'; // Не прочитана
        };

        const calculatePercentage = (book) => {
            if (!book.pageCount) return 0;
            const p = (book.progress / book.pageCount) * 100;
            return Math.min(100, Math.round(p));
        };

        const addNewBook = () => {
            editingIndex.value = -1;
            currentBook.value = {
                title: '', author: '', status: 'Читаю', rating: '', ratingStars: '0', progress: 0, pageCount: 0,
                language: 'Українська', format: 'Паперова', state: 'Куплена', availability: 'На полицях',
                genre: '', series: 'Одиночна', seriesPart: '-', month: ''
            };
            showModal.value = true;
        };

        const editBook = (index) => {
            editingIndex.value = index;
            const b = books.value[index];
            currentBook.value = { ...b };
            // Map rating to stars for select
            let stars = '0';
            if (b.rating) {
                const count = (b.rating.match(/★/g) || []).length;
                stars = count.toString();
            }
            currentBook.value.ratingStars = stars;
            showModal.value = true;
        };

        const closeModal = () => {
            showModal.value = false;
        };

        const saveBook = () => {
            // Convert stars to rating
            const s = parseInt(currentBook.value.ratingStars);
            currentBook.value.rating = s > 0 ? '★'.repeat(s) : '';

            if (editingIndex.value === -1) {
                books.value.unshift(currentBook.value);
            } else {
                books.value[editingIndex.value] = currentBook.value;
            }
            saveToLocal();
            closeModal();
        };

        const deleteBook = () => {
            if (confirm("Видалити цю книгу?")) {
                books.value.splice(editingIndex.value, 1);
                saveToLocal();
                closeModal();
            }
        };

        const completedBooksCount = computed(() => {
            return books.value.filter(b => b.status === 'Завершена').length;
        });

        const pagesReadCount = computed(() => {
            return books.value.reduce((acc, curr) => acc + (parseInt(curr.progress) || 0), 0);
        });

        return {
            books, showModal, editingIndex, currentBook,
            triggerFileInput, handleFileUpload, exportCSV,
            statusColor, calculatePercentage,
            addNewBook, editBook, closeModal, saveBook, deleteBook,
            completedBooksCount, pagesReadCount
        };
    }
}).mount('#app');
