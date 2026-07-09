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
    let processedResults = []; // Global cache for current batch results
    let isProcessing = false; // Flag to prevent duplicate submissions / double fires

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
    }

    function setLoaderProgress(percent, message) {
        progressFill.style.width = `${percent}%`;
        if (message) {
            loaderMessage.textContent = message;
        }
    }

    function hideLoader() {
        progressFill.style.width = '100%';
        setTimeout(() => {
            loaderCard.style.display = 'none';
        }, 400);
    }

    // Drag and Drop Events
    // Fix event bubbling recursion: only trigger fileInput click if target is NOT the fileInput itself
    dropzone.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });

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
        if (amount === undefined || amount === null || isNaN(amount)) return '-';
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

    // Process Batch Upload using client-side sequential queue
    btnProcessBatch.addEventListener('click', () => {
        if (!selectedFile) return;
        if (isProcessing) return; // Prevent double trigger
        isProcessing = true;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                showLoader('Parsing Excel Sheet', 'Reading reference numbers...');
                const dataBytes = new Uint8Array(e.target.result);
                const workbook = XLSX.read(dataBytes, { type: 'array' });
                
                // Get first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert sheet to json array of arrays
                const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (sheetRows.length < 2) {
                    showToast('The Excel sheet appears to be empty.', 'error');
                    hideLoader();
                    isProcessing = false;
                    return;
                }

                // Find the column index containing LESCO reference numbers
                let refColIndex = 0; // fallback
                const firstRow = sheetRows[0] || [];
                
                for (let c = 0; c < firstRow.length; c++) {
                    const colVal = String(firstRow[c] || '').toLowerCase();
                    if (colVal.includes('ref') || colVal.includes('customer') || colVal.includes('id') || colVal.includes('consumer')) {
                        refColIndex = c;
                        break;
                    }
                }
                
                // Collect reference numbers
                const refNumbers = [];
                for (let r = 1; r < sheetRows.length; r++) {
                    const row = sheetRows[r];
                    if (row && row[refColIndex] !== undefined && row[refColIndex] !== null) {
                        const val = String(row[refColIndex]).trim();
                        if (val) {
                            refNumbers.push(val);
                        }
                    }
                }

                if (refNumbers.length === 0) {
                    showToast('No reference numbers found in the sheet.', 'error');
                    hideLoader();
                    isProcessing = false;
                    return;
                }

                showToast(`Found ${refNumbers.length} reference numbers. Starting batch processing...`);
                processedResults = [];
                resultsTableBody.innerHTML = ''; // Clear results table

                // Queue processor (One-by-one sequential requests to prevent proxy overload/Vercel timeout)
                const total = refNumbers.length;
                const chunkSize = 3;

                for (let i = 0; i < total; i += chunkSize) {
                    const chunk = refNumbers.slice(i, i + chunkSize);
                    
                    // Run chunk of 3 queries in parallel
                    await Promise.all(chunk.map(async (refNo, index) => {
                        const currentProcessed = i + index + 1;
                        if (currentProcessed > total) return;
                        
                        try {
                            const response = await fetch('/api/check_single', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ ref_no: refNo })
                            });

                            const result = await response.json();
                            result.input_reference = refNo;
                            
                            processedResults.push(result);
                            appendResultRow(result, false);
                        } catch (err) {
                            console.error(`Error fetching ${refNo}:`, err);
                            const errObj = {
                                input_reference: refNo,
                                message: 'Network error or query timed out.'
                            };
                            processedResults.push(errObj);
                            appendResultRow(errObj, false);
                        }
                    }));
                    
                    // Update Progress bar after the chunk finishes
                    const currentDone = Math.min(i + chunkSize, total);
                    const percent = Math.round((currentDone / total) * 100);
                    setLoaderProgress(percent, `Querying bills... (${currentDone} of ${total} done)`);
                    resultsCount.textContent = processedResults.length;
                    
                    // Polite 500ms delay between chunks to avoid socket issues
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                setLoaderProgress(100, 'Batch processing complete!');
                showToast(`Successfully processed batch of ${total} bills!`);
                
                // Configure Download Button
                btnDownloadExcel.style.display = 'inline-flex';
                btnDownloadExcel.onclick = () => {
                    exportToExcel();
                };

            } catch (err) {
                console.error(err);
                showToast('Failed to parse Excel file.', 'error');
            } finally {
                hideLoader();
                btnProcessBatch.disabled = false;
                isProcessing = false;
            }
        };
        
        reader.readAsArrayBuffer(selectedFile);
    });

    // Client-side Excel compiler using SheetJS
    function exportToExcel() {
        if (processedResults.length === 0) {
            showToast('No results to export.', 'error');
            return;
        }

        const exportData = [];
        // Header
        exportData.push([
            "Input Reference", "Consumer Name", "Reference No (Actual)", "Bill Month",
            "Amount Within Due Date", "Due Date", "Amount After Due Date",
            "Payment Status", "Amount Paid", "Payment Date", "Status", "Bill Link"
        ]);

        processedResults.forEach(res => {
            const isSuccess = res.message === 'Success';
            exportData.push([
                res.input_reference || "",
                isSuccess ? (res.consumer_name || "-") : "-",
                isSuccess ? (res.reference_no || "-") : "-",
                isSuccess ? (res.bill_month || "-") : "-",
                isSuccess ? (res.payable_within_due_date || 0) : 0,
                isSuccess ? (res.due_date || "-") : "-",
                isSuccess ? (res.payable_after_due_date || 0) : 0,
                isSuccess ? (res.payment_status || "-") : "-",
                isSuccess ? (res.amount_paid || 0) : 0,
                isSuccess ? (res.payment_date || "-") : "-",
                isSuccess ? "Success" : "Failed",
                isSuccess && res.bill_link ? (window.location.origin + res.bill_link) : "-"
            ]);
        });

        // Create workbook
        const worksheet = XLSX.utils.aoa_to_sheet(exportData);
        
        // Auto-fit column widths
        const maxColWidths = exportData[0].map((_, colIndex) => {
            return Math.max(...exportData.map(row => String(row[colIndex] || '').length)) + 2;
        });
        worksheet['!cols'] = maxColWidths.map(w => ({ wch: w }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "LESCO Results");
        
        // Write file
        XLSX.writeFile(workbook, "LESCO_Bill_Checker_Results.xlsx");
        showToast('Excel download compiled successfully!');
    }

    // Single Bill Check Lookup
    singleCheckForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isProcessing) return; // Prevent double trigger
        isProcessing = true;

        const refNo = singleRefInput.value.trim();
        if (!refNo) {
            isProcessing = false;
            return;
        }

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
            data.input_reference = refNo; // ensure tracking

            if (response.ok) {
                if (data.message === 'Success') {
                    showToast(`Bill details loaded successfully for ${data.reference_no || refNo}!`);
                } else {
                    showToast(data.message || 'Bill search returned no data.', 'error');
                }
                
                appendResultRow(data, true);
                
                // Add to processed results so it can be exported as well
                processedResults.unshift(data);
                
                // Update Counter
                const rows = resultsTableBody.querySelectorAll('tr');
                resultsCount.textContent = rows.length;
                
                // Enable Download Button
                btnDownloadExcel.style.display = 'inline-flex';
                btnDownloadExcel.onclick = () => {
                    exportToExcel();
                };

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
            isProcessing = false;
        }
    });
});
