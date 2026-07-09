document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileDetails = document.getElementById('fileDetails');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const btnRemoveFile = document.getElementById('btnRemoveFile');
    const btnProcessBatch = document.getElementById('btnProcessBatch');
    const singleCheckForm = document.getElementById('singleCheckForm');
    const singleRefInput = document.getElementById('singleRefInput');
    const btnSingleCheck = document.getElementById('btnSingleCheck');
    const loaderCard = document.getElementById('loaderCard');
    const loaderTitle = document.getElementById('loaderTitle');
    const loaderMessage = document.getElementById('loaderMessage');
    const progressFill = document.getElementById('progressFill');
    const resultsCount = document.getElementById('resultsCount');
    const btnDownloadExcel = document.getElementById('btnDownloadExcel');
    const resultsTableBody = document.getElementById('resultsTableBody');
    const emptyState = document.getElementById('emptyState');
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    let selectedFile = null;
    let progressInterval = null;

    // Toast Notification Utility
    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        toastIcon.className = 'fa-solid toast-icon';
        
        if (type === 'success') {
            toastIcon.classList.add('fa-circle-check', 'success');
        } else if (type === 'error') {
            toastIcon.classList.add('fa-circle-exclamation', 'error');
        } else {
            toastIcon.classList.add('fa-circle-info');
        }
        
        toast.style.display = 'flex';
        
        // Auto-hide toast after 4 seconds
        setTimeout(() => {
            toast.style.display = 'none';
        }, 4000);
    }

    // Loader Utilities
    function showLoader(title, message) {
        loaderTitle.textContent = title;
        loaderMessage.textContent = message;
        progressFill.style.width = '0%';
        loaderCard.style.display = 'block';

        // Simulate smooth progress loading
        let progress = 0;
        if (progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(() => {
            if (progress < 92) {
                progress += Math.floor(Math.random() * 8) + 2;
                progressFill.style.width = `${Math.min(progress, 92)}%`;
            }
        }, 500);
    }

    function hideLoader() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        progressFill.style.width = '100%';
        setTimeout(() => {
            loaderCard.style.display = 'none';
        }, 400);
    }

    // Drag and Drop Events
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension !== 'xlsx' && extension !== 'xls') {
            showToast('Invalid file type! Please select an Excel file (.xlsx or .xls)', 'error');
            return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        
        // Format size
        if (file.size < 1024 * 1024) {
            fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        } else {
            fileSize.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
        }

        dropzone.style.display = 'none';
        fileDetails.style.display = 'flex';
        btnProcessBatch.disabled = false;
        showToast('Excel file loaded successfully!');
    }

    btnRemoveFile.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        fileDetails.style.display = 'none';
        dropzone.style.display = 'flex';
        btnProcessBatch.disabled = true;
    });

    // Helper to format currency
    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return '-';
        return `Rs. ${amount.toLocaleString()}`;
    }

    // Helper to append a row to results table
    function appendResultRow(data, isSingle = false) {
        // Remove empty state row if it's there
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        const tr = document.createElement('tr');
        
        // Check for success or error status
        const isSuccess = data.message === 'Success';
        
        let statusBadge = '';
        if (isSuccess) {
            if (data.payment_status === 'Paid') {
                statusBadge = `<span class="badge badge-paid"><i class="fa-solid fa-check-double"></i> Paid</span>`;
            } else {
                statusBadge = `<span class="badge badge-unpaid"><i class="fa-solid fa-circle-exclamation"></i> Unpaid</span>`;
            }
        } else {
            statusBadge = `<span class="badge badge-error"><i class="fa-solid fa-triangle-exclamation"></i> Error</span>`;
        }

        // Set row columns
        let actionCol = '-';
        if (isSuccess && data.bill_link) {
            actionCol = `
                <a href="${data.bill_link}" target="_blank" class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                    <i class="fa-solid fa-eye"></i> View
                </a>
            `;
        }

        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--text-secondary);">${data.input_reference}</td>
            <td>${isSuccess ? (data.consumer_name || '-') : '-'}</td>
            <td>${isSuccess ? (data.reference_no || '-') : '-'}</td>
            <td>${isSuccess ? (data.bill_month || '-') : '-'}</td>
            <td style="font-weight: 700; color: var(--text-primary);">${isSuccess ? formatCurrency(data.payable_within_due_date) : '-'}</td>
            <td>${isSuccess ? (data.due_date || '-') : '-'}</td>
            <td>${statusBadge}</td>
            <td>${isSuccess ? (data.payment_date || '-') : '-'}</td>
            <td style="font-size: 0.8rem; color: ${isSuccess ? 'var(--text-muted)' : 'var(--accent-red)'}; white-space: normal; min-width: 150px;">
                ${data.message || '-'}
            </td>
            <td>${actionCol}</td>
        `;

        if (isSingle) {
            // Put single search at the top of the table body
            resultsTableBody.insertBefore(tr, resultsTableBody.firstChild);
        } else {
            // Append batch results
            resultsTableBody.appendChild(tr);
        }
    }

    // Process Batch Upload
    btnProcessBatch.addEventListener('click', async () => {
        if (!selectedFile) return;

        const formData = new FormData();
        formData.append('file', selectedFile);

        showLoader('Processing Excel Batch', 'Extracting reference numbers and querying LESCO. Please wait...');
        btnProcessBatch.disabled = true;

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.status === 'Success') {
                showToast(`Batch completed successfully! Processed ${data.processed_items} bills.`);
                
                // Clear existing table content (except emptyState template)
                resultsTableBody.innerHTML = '';
                
                // Add all results
                data.results.forEach(res => appendResultRow(res, false));
                
                // Update counter
                resultsCount.textContent = data.results.length;
                
                // Configure Download Button
                btnDownloadExcel.style.display = 'inline-flex';
                btnDownloadExcel.onclick = () => {
                    window.location.href = `/api/download/${data.batch_id}`;
                };
            } else {
                showToast(data.message || 'Failed to process Excel batch.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('A network error occurred. Please check if Flask server is running.', 'error');
        } finally {
            hideLoader();
            btnProcessBatch.disabled = false;
        }
    });

    // Single Bill Check Lookup
    singleCheckForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const refNo = singleRefInput.value.trim();
        if (!refNo) return;

        showLoader('Retrieving Bill Details', `Searching LESCO database for ${refNo}...`);
        btnSingleCheck.disabled = true;

        try {
            const response = await fetch('/api/check_single', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ref_no: refNo })
            });

            const data = await response.json();

            if (response.ok) {
                if (data.message === 'Success') {
                    showToast(`Bill details loaded successfully for ${data.reference_no || refNo}!`);
                } else {
                    showToast(data.message || 'Bill search returned no data.', 'error');
                }
                
                appendResultRow(data, true);
                
                // Update Counter
                const rows = resultsTableBody.querySelectorAll('tr:not(.empty-state-row)');
                resultsCount.textContent = rows.length;
                
                singleRefInput.value = '';
            } else {
                showToast(data.message || 'Failed to retrieve bill.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('A network error occurred while fetching bill.', 'error');
        } finally {
            hideLoader();
            btnSingleCheck.disabled = false;
        }
    });
});
