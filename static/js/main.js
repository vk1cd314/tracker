document.addEventListener('DOMContentLoaded', () => {
    // Core UI Elements
    const cfHandleInput = document.getElementById('cfHandle');
    const fetchButton = document.getElementById('fetchButton');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');

    // Dashboard Section Elements
    const dashboardSection = document.getElementById('dashboard-section');
    const selectedYearDisplay = document.getElementById('selectedYearDisplay');
    const verticalYearScroller = document.getElementById('verticalYearScroller');

    // Detailed Submissions & Filters Elements
    const submissionsDetailsToggle = document.getElementById('submissions-details-toggle');
    const controlsSection = document.getElementById('controls-section');
    const minRatingInput = document.getElementById('minRating');
    const maxRatingInput = document.getElementById('maxRating');
    const tagFilterSelect = document.getElementById('tagFilter');
    const languageFilterSelect = document.getElementById('languageFilter');
    const sortBySelect = document.getElementById('sortBy');
    const sortOrderSelect = document.getElementById('sortOrder');
    const applyFiltersButton = document.getElementById('applyFiltersButton');
    const resetFiltersButton = document.getElementById('resetFiltersButton');
    const submissionsTitle = document.getElementById('submissions-title');
    const submissionsListDiv = document.getElementById('submissions-list');
    const emptyStateMessageDiv = document.getElementById('empty-state-message');
    const paginationControlsDiv = document.getElementById('pagination-controls');

    // Global State
    let allSubmissions = [];
    let currentFilteredAndSortedSubmissions = [];
    let currentPage = 1;
    const itemsPerPage = 50;

    // Chart Instances
    let submissionsOverTimeChartInstance = null;
    let problemRatingDistributionChartInstance = null;
    let languageUsageChartInstance = null;
    let problemTagsChartInstance = null;

    // Year Scroller State
    let currentSelectedYear = null;
    let allAvailableYears = [];
    let yearScrollTimeout;

    const emptyStateSVG = `
        <svg class="mx-auto h-24 w-24 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464A5 5 0 008.464 15.536" />
        </svg>`;
    
    const externalLinkSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 inline-block ml-1 align-middle text-gray-500 group-hover:text-blue-600">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>`;

    // --- MAIN FETCH LOGIC ---
    fetchButton.addEventListener('click', async () => {
        const cfHandle = cfHandleInput.value.trim();
        resetStateBeforeFetch();

        if (!cfHandle) {
            showError('Codeforces handle cannot be empty.');
            return;
        }
        loadingIndicator.classList.remove('hidden');

        try {
            const response = await fetch('/fetch_submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cfHandle }),
            });
            const result = await response.json();
            loadingIndicator.classList.add('hidden');

            if (response.ok && result.status === 'OK') {
                allSubmissions = result.submissions || [];
                if (allSubmissions.length > 0) {
                    dashboardSection.classList.remove('hidden');
                    if (submissionsDetailsToggle.open) { // If user had it open, ensure controls are visible
                        controlsSection.classList.remove('hidden'); 
                    } else { // Otherwise, ensure they are hidden
                        controlsSection.classList.add('hidden');
                    }

                    updateAllCharts(allSubmissions);
                    populateFilterOptions();
                    applyFiltersAndSort(); // This will also handle initial rendering of page 1
                } else {
                    renderSubmissionsPage([]); // Show initial empty state for submissions list
                    showEmptyDashboardMessage(); // Show message in dashboard area too
                }
            } else {
                showError(result.message || 'Failed to fetch data. Please try again.');
                allSubmissions = [];
                renderSubmissionsPage([]);
                showEmptyDashboardMessage();
            }
        } catch (error) {
            loadingIndicator.classList.add('hidden');
            showError('An error occurred while fetching data. Check console for details.');
            console.error('Fetch error:', error);
            allSubmissions = [];
            renderSubmissionsPage([]);
            showEmptyDashboardMessage();
        }
    });

    function resetStateBeforeFetch() {
        submissionsListDiv.innerHTML = '';
        emptyStateMessageDiv.classList.add('hidden');
        emptyStateMessageDiv.innerHTML = '';
        errorMessageDiv.textContent = '';
        errorMessageDiv.classList.add('hidden');
        submissionsTitle.classList.add('hidden');
        
        dashboardSection.classList.add('hidden');
        // Ensure controls are hidden on reset, respecting the details toggle current state
        if (!submissionsDetailsToggle.open) {
             controlsSection.classList.add('hidden');
        } else {
            // If details is open, but we are resetting, we might still want to hide controls until new data populates them
            // However, the toggle listener should handle showing it correctly if data exists post-fetch.
            // For safety, let's explicitly hide it here, it will be re-shown if needed by the toggle listener + data check.
            controlsSection.classList.add('hidden');
        }

        allSubmissions = [];
        currentFilteredAndSortedSubmissions = [];
        currentPage = 1;
        clearFilterInputs();
        destroyAllCharts();
    }

    function showError(message) {
        errorMessageDiv.innerHTML = `<p>${message}</p>`; // Allow simple HTML in errors
        errorMessageDiv.classList.remove('hidden');
        errorMessageDiv.classList.add('p-3', 'bg-red-100', 'border', 'border-red-400', 'text-red-700', 'rounded-md', 'error-message-styled');
    }

    function showEmptyDashboardMessage() {
        // If you want a specific message when dashboard is empty because no user data
        // For now, just ensures charts are cleared / not shown
        dashboardSection.classList.add('hidden'); 
    }

    // --- CHART RENDERING LOGIC ---
    function destroyAllCharts() {
        if (submissionsOverTimeChartInstance) submissionsOverTimeChartInstance.destroy();
        if (problemRatingDistributionChartInstance) problemRatingDistributionChartInstance.destroy();
        if (languageUsageChartInstance) languageUsageChartInstance.destroy();
        if (problemTagsChartInstance) problemTagsChartInstance.destroy();
        submissionsOverTimeChartInstance = null;
        problemRatingDistributionChartInstance = null;
        languageUsageChartInstance = null;
        problemTagsChartInstance = null;
    }

    function updateAllCharts(submissions) {
        destroyAllCharts(); // Clear previous charts before redrawing
        if (!submissions || submissions.length === 0) {
            // Maybe display a message in chart areas like "Not enough data for charts"
            return;
        }
        setupYearControlsAndRenderTimeChart(submissions);
        renderProblemRatingDistributionChart(submissions);
        renderLanguageUsageChart(submissions);
        renderProblemTagsChart(submissions);
    }

    function setupYearControlsAndRenderTimeChart(submissions) {
        allAvailableYears = [...new Set(submissions.map(s => new Date(s.creation_time_seconds * 1000).getFullYear()))].sort((a, b) => b - a); // Descending
        verticalYearScroller.innerHTML = '';
        verticalYearScroller.removeEventListener('scroll', handleYearScrollDebounced);

        if (allAvailableYears.length === 0) {
            selectedYearDisplay.textContent = 'N/A';
            renderTimeChartForSelectedYear([]);
            return;
        }

        allAvailableYears.forEach(year => {
            const item = document.createElement('div');
            item.textContent = year;
            item.className = 'year-item';
            item.dataset.year = year;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0'); // Make it focusable
            item.onclick = () => selectYear(year, item);
            item.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') selectYear(year, item); }; 
            verticalYearScroller.appendChild(item);
        });
        
        currentSelectedYear = allAvailableYears.includes(currentSelectedYear) ? currentSelectedYear : allAvailableYears[0];
        selectYear(currentSelectedYear, Array.from(verticalYearScroller.children).find(i => parseInt(i.dataset.year) === currentSelectedYear));
        
        verticalYearScroller.addEventListener('scroll', handleYearScrollDebounced);
    }
    
    function selectYear(year, itemElement) {
        currentSelectedYear = year;
        selectedYearDisplay.textContent = year;
        document.querySelectorAll('#verticalYearScroller .year-item').forEach(i => i.classList.remove('selected'));
        if (itemElement) {
            itemElement.classList.add('selected');
            // Scroll item to center
            setTimeout(() => { 
                verticalYearScroller.scrollTo({
                    top: itemElement.offsetTop - (verticalYearScroller.clientHeight / 2) + (itemElement.clientHeight / 2),
                    behavior: 'smooth'
                });
                updateYearItemOpacities(); 
            }, 0);
        }
        renderTimeChartForSelectedYear(allSubmissions);
    }

    const handleYearScrollDebounced = () => {
        clearTimeout(yearScrollTimeout);
        yearScrollTimeout = setTimeout(updateYearItemOpacities, 150);
    };

    function updateYearItemOpacities() {
        const scrollerRect = verticalYearScroller.getBoundingClientRect();
        const scrollerCenterY = scrollerRect.top + scrollerRect.height / 2;
        let closestItemToCenter = null;
        let minDistance = Infinity;

        verticalYearScroller.childNodes.forEach(item => {
            if (item.nodeType !== 1) return;
            const itemRect = item.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const distance = Math.abs(scrollerCenterY - itemCenterY);
            const maxVisibleDistance = scrollerRect.height / 2.5;
            let opacity = Math.max(0.1, Math.min(1, 1 - (distance / maxVisibleDistance)));
            item.style.opacity = opacity;
            item.classList.remove('focused-scroll');
            if (distance < minDistance) {
                minDistance = distance;
                closestItemToCenter = item;
            }
        });
        if (closestItemToCenter) {
            closestItemToCenter.classList.add('focused-scroll');
            closestItemToCenter.style.opacity = 1;
        }
    }

    function renderTimeChartForSelectedYear(submissions) {
        if (submissionsOverTimeChartInstance) submissionsOverTimeChartInstance.destroy();
        const timeCanvas = document.getElementById('submissionsOverTimeChart');
        if (!timeCanvas) return;
        const timeCtx = timeCanvas.getContext('2d');
        timeCtx.clearRect(0, 0, timeCanvas.width, timeCanvas.height);

        if (!currentSelectedYear || !submissions || submissions.length === 0) return;

        const weeklyData = {};
        submissions.forEach(sub => {
            const subDate = new Date(sub.creation_time_seconds * 1000);
            if (subDate.getFullYear() === currentSelectedYear) {
                const mondayOfCalendarWeek = new Date(subDate);
                mondayOfCalendarWeek.setDate(subDate.getDate() - (subDate.getDay() === 0 ? 6 : subDate.getDay() - 1));
                mondayOfCalendarWeek.setHours(0,0,0,0);
                const weekKey = mondayOfCalendarWeek.toISOString().split('T')[0];
                weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
            }
        });

        const sortedWeekKeys = Object.keys(weeklyData).sort();
        if (sortedWeekKeys.length === 0) return; 

        const labels = sortedWeekKeys.map(key => `W${getWeekNumber(new Date(key))}`);
        const data = sortedWeekKeys.map(key => weeklyData[key]);

        submissionsOverTimeChartInstance = new Chart(timeCtx, {
            type: 'line',
            data: { labels, datasets: [{
                label: `Solved Problems per Week (${currentSelectedYear})`,
                data,
                fill: true, borderColor: 'rgb(75, 192, 192)', tension: 0.1, backgroundColor: 'rgba(75, 192, 192, 0.2)'
            }]},
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });
    }
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    function renderProblemRatingDistributionChart(submissions) {
        if (problemRatingDistributionChartInstance) problemRatingDistributionChartInstance.destroy();
        const canvas = document.getElementById('problemRatingDistributionChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        const ratingBuckets = {'<1000':0,'1000-1199':0,'1200-1399':0,'1400-1599':0,'1600-1799':0,'1800-1999':0,'2000-2199':0,'2200-2399':0,'2400-2599':0,'2600-2799':0,'2800-2999':0,'>=3000':0};
        submissions.forEach(sub => {
            const r = sub.problem_rating;
            if (r === null || r === undefined) return;
            if (r < 1000) ratingBuckets['<1000']++; else if (r < 1200) ratingBuckets['1000-1199']++;
            else if (r < 1400) ratingBuckets['1200-1399']++; else if (r < 1600) ratingBuckets['1400-1599']++;
            else if (r < 1800) ratingBuckets['1600-1799']++; else if (r < 2000) ratingBuckets['1800-1999']++;
            else if (r < 2200) ratingBuckets['2000-2199']++; else if (r < 2400) ratingBuckets['2200-2399']++;
            else if (r < 2600) ratingBuckets['2400-2599']++; else if (r < 2800) ratingBuckets['2600-2799']++;
            else if (r < 3000) ratingBuckets['2800-2999']++; else ratingBuckets['>=3000']++;
        });
        problemRatingDistributionChartInstance = new Chart(ctx, {
            type: 'bar', data: { labels: Object.keys(ratingBuckets), datasets: [{
                label: 'Problems by Rating', data: Object.values(ratingBuckets),
                backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1
            }]}, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });
    }

    function renderLanguageUsageChart(submissions) {
        if (languageUsageChartInstance) languageUsageChartInstance.destroy();
        const canvas = document.getElementById('languageUsageChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        const langUsage = {};
        submissions.forEach(sub => { langUsage[sub.language] = (langUsage[sub.language] || 0) + 1; });
        languageUsageChartInstance = new Chart(ctx, {
            type: 'pie', data: { labels: Object.keys(langUsage), datasets: [{
                label: 'Language Usage', data: Object.values(langUsage),
                backgroundColor: ['rgba(255,99,132,0.7)','rgba(54,162,235,0.7)','rgba(255,206,86,0.7)','rgba(75,192,192,0.7)','rgba(153,102,255,0.7)','rgba(255,159,64,0.7)'], hoverOffset: 4
            }]}, options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderProblemTagsChart(submissions) {
        if (problemTagsChartInstance) problemTagsChartInstance.destroy();
        const canvas = document.getElementById('problemTagsChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        const tagCounts = {};
        submissions.forEach(sub => {
            if (sub.problem_tags) sub.problem_tags.split(',').forEach(tag => { 
                const t = tag.trim(); if(t) tagCounts[t] = (tagCounts[t] || 0) + 1; 
            });
        });
        const sortedTags = Object.entries(tagCounts).sort(([,a],[,b]) => b-a).slice(0, 15);
        if (sortedTags.length === 0) return;
        problemTagsChartInstance = new Chart(ctx, {
            type: 'bar', data: { labels: sortedTags.map(e=>e[0]), datasets: [{
                label: 'Tag Frequency', data: sortedTags.map(e=>e[1]),
                backgroundColor: 'rgba(255, 159, 64, 0.6)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1
            }]}, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
        });
    }

    // --- DETAILED SUBMISSIONS: FILTER, SORT, PAGINATION --- 
    function populateFilterOptions() {
        const allTags = new Set();
        allSubmissions.forEach(sub => { if (sub.problem_tags) sub.problem_tags.split(',').forEach(tag => allTags.add(tag.trim())); });
        tagFilterSelect.innerHTML = '';
        Array.from(allTags).sort().forEach(tag => { if(tag) tagFilterSelect.add(new Option(tag, tag)); });

        const allLanguages = new Set();
        allSubmissions.forEach(sub => { if (sub.language) allLanguages.add(sub.language.trim()); });
        languageFilterSelect.innerHTML = '<option value="">All Languages</option>';
        Array.from(allLanguages).sort().forEach(lang => { if(lang) languageFilterSelect.add(new Option(lang, lang)); });
    }

    function applyFiltersAndSort() {
        let filtered = [...allSubmissions];
        const minR = parseInt(minRatingInput.value), maxR = parseInt(maxRatingInput.value);
        if (!isNaN(minR)) filtered = filtered.filter(s => s.problem_rating !== null && s.problem_rating >= minR);
        if (!isNaN(maxR)) filtered = filtered.filter(s => s.problem_rating !== null && s.problem_rating <= maxR);
        
        const selTags = Array.from(tagFilterSelect.selectedOptions).map(opt => opt.value);
        if (selTags.length > 0) filtered = filtered.filter(s => s.problem_tags && selTags.some(st => s.problem_tags.split(',').map(t=>t.trim()).includes(st)));
        
        const selLang = languageFilterSelect.value;
        if (selLang) filtered = filtered.filter(s => s.language === selLang);

        const sortBy = sortBySelect.value, sortOrd = sortOrderSelect.value;
        filtered.sort((a, b) => {
            let valA = a[sortBy], valB = b[sortBy];
            if (sortBy === 'problem_rating') {
                valA = valA ?? (sortOrd === 'asc' ? Infinity : -Infinity);
                valB = valB ?? (sortOrd === 'asc' ? Infinity : -Infinity);
            }
            if (sortBy === 'problem_name') {
                valA = (valA || '').toLowerCase(); valB = (valB || '').toLowerCase();
            }
            if (valA < valB) return sortOrd === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrd === 'asc' ? 1 : -1;
            return 0;
        });
        currentFilteredAndSortedSubmissions = filtered;
        currentPage = 1; // Reset to page 1 after filtering/sorting
        renderSubmissionsPage(currentFilteredAndSortedSubmissions);
        renderPaginationControls(currentFilteredAndSortedSubmissions.length);
    }

    applyFiltersButton.addEventListener('click', applyFiltersAndSort);
    resetFiltersButton.addEventListener('click', () => { clearFilterInputs(); applyFiltersAndSort(); });
    
    function clearFilterInputs() {
        minRatingInput.value = ''; maxRatingInput.value = '';
        tagFilterSelect.selectedIndex = -1; languageFilterSelect.value = '';
        sortBySelect.value = 'creation_time_seconds'; sortOrderSelect.value = 'desc';
    }

    function renderSubmissionsPage(submissionsForPage) {
        submissionsListDiv.innerHTML = '';
        errorMessageDiv.classList.add('hidden');

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageItems = submissionsForPage.slice(startIndex, endIndex);

        if (pageItems.length > 0) {
            submissionsTitle.classList.remove('hidden');
            emptyStateMessageDiv.classList.add('hidden');
            emptyStateMessageDiv.innerHTML = '';
            pageItems.forEach(sub => submissionsListDiv.appendChild(createSubmissionCard(sub)));
        } else {
            submissionsTitle.classList.add('hidden');
            emptyStateMessageDiv.classList.remove('hidden');
            const message = allSubmissions.length === 0 && cfHandleInput.value.trim() !== '' ? 
                'No solved problems found for this user. Try a different Codeforces handle.' :
                'No problems match your current filters. Try adjusting your filter criteria.';
            emptyStateMessageDiv.innerHTML = `${emptyStateSVG} <p class="text-lg">${message}</p>`;
        }
    }
    
    function createSubmissionCard(sub) {
        const card = document.createElement('div');
        card.className = 'bg-white p-3 sm:p-4 rounded-lg shadow-md hover:shadow-lg hover:scale-[1.01] transition-all duration-200 ease-in-out fade-in group';
        
        const date = new Date(sub.creation_time_seconds * 1000);
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        let problemUrl = '#';
        if (sub.contest_id && sub.problem_index) {
            problemUrl = String(sub.contest_id).length >= 6 ? 
                `https://codeforces.com/gym/${sub.contest_id}/problem/${sub.problem_index}` :
                `https://codeforces.com/problemset/problem/${sub.contest_id}/${sub.problem_index}`;
        }
        const problemLinkHtml = problemUrl !== '#' ?
            `<a href="${problemUrl}" target="_blank" rel="noopener noreferrer" class="hover:underline text-blue-600 group-hover:text-blue-700">
                ${sub.problem_name || 'N/A'}
                ${externalLinkSvg}
            </a>` :
            (sub.problem_name || 'N/A');
        
        const ratingDisplay = sub.problem_rating !== null && sub.problem_rating !== undefined ? sub.problem_rating : 'N/A';
        const ratingColorClass = getRatingColor(sub.problem_rating);
        
        let tagsHtml = '<p class="text-xs text-gray-400 italic">No tags</p>';
        if (sub.problem_tags && sub.problem_tags.length > 0) {
            tagsHtml = sub.problem_tags.split(',').map(tag =>
                `<span class="inline-block bg-gray-200 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-gray-600 mr-0.5 mb-0.5">${tag.trim()}</span>`
            ).join('');
        }
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <h3 class="text-base sm:text-lg font-semibold text-blue-700">
                    ${problemLinkHtml}
                </h3>
                <span class="text-xs text-gray-400 whitespace-nowrap ml-2">${formattedDate}</span>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mb-1.5">
                <p class="text-gray-500">
                    ID: <span class="font-medium text-gray-700">${sub.problem_id}</span>
                </p>
                <p class="text-gray-500">
                    Rating: <span class="${ratingColorClass}">${ratingDisplay}</span>
                </p>
                <p class="text-gray-500">
                    Language: <span class="font-medium text-gray-700">${sub.language || 'N/A'}</span>
                </p>
            </div>
            <div>
                <p class="text-[11px] text-gray-400 mb-0.5">Tags:</p>
                <div class="flex flex-wrap leading-tight">
                    ${tagsHtml}
                </div>
            </div>
        `;
        return card;
    }

    function renderPaginationControls(totalItems) {
        paginationControlsDiv.innerHTML = '';
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) return;

        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderSubmissionsPage(currentFilteredAndSortedSubmissions); renderPaginationControls(totalItems); } });
        paginationControlsDiv.appendChild(prevButton);

        const pageInfo = document.createElement('span');
        pageInfo.className = 'current-page';
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        paginationControlsDiv.appendChild(pageInfo);

        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener('click', () => { if(currentPage < totalPages) { currentPage++; renderSubmissionsPage(currentFilteredAndSortedSubmissions); renderPaginationControls(totalItems); } });
        paginationControlsDiv.appendChild(nextButton);
    }

    // --- HELPERS ---
    function getRatingColor(rating) {
        if (rating === null || rating === undefined || rating === 0) return 'text-gray-400 font-medium';
        if (rating < 1200) return 'text-gray-500 font-medium';      // Newbie
        if (rating < 1400) return 'text-green-500 font-semibold';   // Pupil
        if (rating < 1600) return 'text-cyan-500 font-semibold';    // Specialist
        if (rating < 1900) return 'text-blue-600 font-semibold';    // Expert
        if (rating < 2100) return 'text-purple-600 font-semibold';  // Candidate Master
        if (rating < 2300) return 'text-yellow-500 font-semibold';  // Master
        if (rating < 2400) return 'text-orange-500 font-semibold';  // International Master
        if (rating < 2600) return 'text-red-500 font-semibold';     // Grandmaster
        if (rating < 3000) return 'text-red-600 font-semibold';     // Intl. Grandmaster
        return 'text-red-700 font-bold';                           // Legendary
    }

     // Event listener for the details toggle to ensure controls section visibility is managed.
     if (submissionsDetailsToggle) {
        submissionsDetailsToggle.addEventListener('toggle', () => {
            if (submissionsDetailsToggle.open) {
                if (allSubmissions.length > 0) { // Only show controls if there's data
                    controlsSection.classList.remove('hidden');
                }
            } else {
                controlsSection.classList.add('hidden');
            }
        });
    }
});
