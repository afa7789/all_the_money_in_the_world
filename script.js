let currentScale = 100; // Fixed scale in billions per block
let updateCount = 0;
let isUpdating = false;
let wealthData = null;
let filteredItems = [];
let comparisonItems = [];
let activeCategoryFilter = ''; // Track active category filter from legend

// SHA-256 implementation for vanilla JS (simplified)
async function sha256(message) {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Generate crazy vibrant color from slug using SHA-256
async function generateCrazyColor(slug) {
    const hash = await sha256(slug);
    
    // Divide hash into 3 equal parts (each 21-22 chars for 64-char hash)
    const third = Math.floor(hash.length / 3);
    const part1 = hash.slice(0, third);
    const part2 = hash.slice(third, third * 2);
    const part3 = hash.slice(third * 2);
    
    // Convert each part to RGB values (use first 2 chars of each part)
    const r = parseInt(part1.slice(0, 2), 16);
    const g = parseInt(part2.slice(0, 2), 16);
    const b = parseInt(part3.slice(0, 2), 16);
    
    // Make colors more vibrant by boosting saturation
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const boost = 1.5; // Saturation boost
    
    let newR = r, newG = g, newB = b;
    
    if (max > 0) {
        newR = min + (r - min) * boost;
        newG = min + (g - min) * boost;
        newB = min + (b - min) * boost;
    }
    
    // Clamp values to 0-255
    newR = Math.min(255, Math.max(0, newR));
    newG = Math.min(255, Math.max(0, newG));
    newB = Math.min(255, Math.max(0, newB));
    
    return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
}

// Storage helper functions
function saveDataToStorage(data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now(),
            version: data.metadata.dataVersion
        };
        localStorage.setItem('wealthData-cache', JSON.stringify(cacheData));
        console.log('💾 Data cached to localStorage');
    } catch (error) {
        console.warn('Failed to cache data to localStorage:', error);
    }
}

function loadDataFromStorage() {
    try {
        const cached = localStorage.getItem('wealthData-cache');
        if (!cached) return null;
        
        const cacheData = JSON.parse(cached);
        const cacheAge = Date.now() - cacheData.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (cacheAge > maxAge) {
            console.log('📅 Cached data is too old, removing...');
            localStorage.removeItem('wealthData-cache');
            return null;
        }
        
        console.log(`⚡ Loading cached data (version: ${cacheData.version}, age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
        return cacheData.data;
    } catch (error) {
        console.warn('Failed to load cached data:', error);
        localStorage.removeItem('wealthData-cache');
        return null;
    }
}

// Load data from JSON file with fallback
async function loadData() {
    // First try to load from cache for faster startup
    const cachedData = loadDataFromStorage();
    if (cachedData) {
        wealthData = cachedData;
        console.log('🚀 Using cached data for fast loading...');
        
        // Generate colors for cached data
        await generateColorsForData(wealthData);
        
        // Try to fetch fresh data in background
        fetchFreshDataInBackground();
        return true;
    }
    
    // No cache, load fresh data
    try {
        console.log('📡 Loading fresh data from data.json...');
        const response = await fetch('./data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        wealthData = await response.json();
        console.log('✅ Fresh data loaded, generating colors...');
        
        // Generate colors for fresh data
        await generateColorsForData(wealthData);
        
        // Cache the fresh data
        saveDataToStorage(wealthData);
        
        console.log(`💾 Data loaded and cached. Version: ${wealthData.metadata.dataVersion}, Last updated: ${wealthData.metadata.lastUpdated}`);
        console.log('🎨 Categories with colors:', wealthData.categories.map(c => ({name: c.name, color: c.color})));
        return true;
    } catch (error) {
        console.error('❌ Failed to load data.json, using fallback data:', error);
        // Fallback to hardcoded data if JSON fails
        wealthData = await getHardcodedFallbackData();
        return false;
    }
}

// Background data refresh function
async function fetchFreshDataInBackground() {
    try {
        console.log('🔄 Checking for data updates in background...');
        const response = await fetch('./data.json?t=' + Date.now()); // Cache bust
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const freshData = await response.json();
        
        // Check if data has changed
        if (freshData.metadata.dataVersion !== wealthData.metadata.dataVersion || 
            freshData.metadata.lastUpdated !== wealthData.metadata.lastUpdated) {
            
            console.log('🆕 New data version detected, updating...');
            
            // Generate colors for fresh data
            await generateColorsForData(freshData);
            
            // Update global data
            wealthData = freshData;
            
            // Cache the fresh data
            saveDataToStorage(wealthData);
            
            // Refresh UI
            createVisualization();
            createDataSources();
            createLegend();
            
            // Show update notification
            showUpdateNotification('Data updated to version ' + freshData.metadata.dataVersion);
        } else {
            console.log('✅ Data is current');
        }
    } catch (error) {
        console.warn('⚠️ Background data refresh failed:', error);
    }
}

// Extract color generation to reusable function
async function generateColorsForData(data) {
    // Generate crazy colors for categories based on their slugs
    for (const category of data.categories) {
        try {
            category.color = await generateCrazyColor(category.id);
            console.log(`🎨 Generated color for ${category.name}: ${category.color}`);
        } catch (error) {
            console.error(`Failed to generate color for ${category.name}:`, error);
            category.color = '#' + Math.floor(Math.random()*16777215).toString(16); // Fallback random color
        }
    }
    
    // Generate colors for individual items based on their slugs too
    for (const item of data.items) {
        try {
            item.color = await generateCrazyColor(item.slug);
        } catch (error) {
            console.error(`Failed to generate color for ${item.name}:`, error);
            item.color = '#' + Math.floor(Math.random()*16777215).toString(16); // Fallback random color
        }
    }
}

// Hardcoded fallback data (minimal version)
async function getHardcodedFallbackData() {
    const fallbackData = {
        metadata: {
            lastUpdated: "2025-07-04T00:00:00Z",
            dataVersion: "1.0-fallback",
            currency: "USD",
            baseUnit: "billions",
            blockRepresentation: 100
        },
        categories: [
            { id: "individual-wealth", name: "Individual Wealth" },
            { id: "digital-assets", name: "Digital Assets" },
            { id: "national-economy", name: "National Economy" },
            { id: "stock-markets", name: "Stock Markets" },
            { id: "debt", name: "Debt" },
            { id: "real-assets", name: "Real Assets" },
            { id: "private-wealth", name: "Private Wealth" },
            { id: "financial-instruments", name: "Financial Instruments" }
        ],
        items: [
            { id: "elon-musk", slug: "elon-musk-net-worth", name: "Elon Musk", categoryId: "individual-wealth", valueBillions: 240, valueFormatted: "240 billion", isLiveUpdatable: false },
            { id: "crypto-market-cap", slug: "cryptocurrency-total-market-cap", name: "Cryptocurrency", categoryId: "digital-assets", valueBillions: 2400, valueFormatted: "2.4 trillion", isLiveUpdatable: true },
            { id: "us-gdp", slug: "united-states-gross-domestic-product", name: "U.S. GDP", categoryId: "national-economy", valueBillions: 27000, valueFormatted: "27 trillion", isLiveUpdatable: true },
            { id: "global-equities", slug: "global-equities-total-market-cap", name: "Global Equities", categoryId: "stock-markets", valueBillions: 110000, valueFormatted: "110 trillion", isLiveUpdatable: false },
            { id: "global-debt", slug: "global-debt-total", name: "Global Debt", categoryId: "debt", valueBillions: 315000, valueFormatted: "315 trillion", isLiveUpdatable: false },
            { id: "global-real-estate", slug: "global-real-estate-total-value", name: "Global Real Estate", categoryId: "real-assets", valueBillions: 380000, valueFormatted: "380 trillion", isLiveUpdatable: false },
            { id: "global-private-wealth", slug: "global-private-wealth-total", name: "Global Private Wealth", categoryId: "private-wealth", valueBillions: 550000, valueFormatted: "550 trillion", isLiveUpdatable: false },
            { id: "derivatives-notional-value", slug: "derivatives-total-notional-value", name: "Derivatives (Notional)", categoryId: "financial-instruments", valueBillions: 715000, valueFormatted: "715 trillion", isLiveUpdatable: false }
        ]
    };
    
    // Generate crazy colors for categories and items using the shared function
    await generateColorsForData(fallbackData);
    
    return fallbackData;
}

// Parse value string to number in billions (now works with the new data structure)
function parseValue(item) {
    if (typeof item.valueBillions === 'number') {
        return item.valueBillions;
    }
    
    // Fallback to parsing the formatted string if needed
    const valueStr = item.valueFormatted || item.value || '0';
    const cleanStr = valueStr.toLowerCase().replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleanStr);
    
    if (valueStr.includes('trillion')) {
        return num * 1000;
    } else if (valueStr.includes('billion')) {
        return num;
    }
    return num;
}

// Apply dynamic colors to CSS custom properties
// Get category by ID
function getCategoryById(categoryId) {
    return wealthData.categories.find(cat => cat.id === categoryId);
}

// Create visualization blocks
function createVisualization() {
    if (!wealthData) {
        console.error('No data available for visualization');
        return;
    }
    
    const container = document.getElementById('blocks-container');
    container.innerHTML = '';
    
    // Get current sort and filter settings
    const sortBy = document.getElementById('sortBy')?.value || 'value';
    const searchQuery = document.getElementById('searchInput')?.value.toLowerCase() || '';
    
    // Filter and sort items
    let items = wealthData.items.filter(item => {
        const matchesCategory = !activeCategoryFilter || item.categoryId === activeCategoryFilter;
        const matchesSearch = !searchQuery || 
            item.name.toLowerCase().includes(searchQuery) ||
            item.slug.toLowerCase().includes(searchQuery);
        return matchesCategory && matchesSearch;
    });
    
    // Sort items (all ascending)
    items.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'category':
                return a.categoryId.localeCompare(b.categoryId);
            case 'value':
            default:
                return parseValue(a) - parseValue(b); // Ascending order
        }
    });
    
    filteredItems = items;
    
    // Add scale reference item at the beginning
    const scaleReference = document.createElement('div');
    scaleReference.className = 'scale-reference';
    scaleReference.innerHTML = `
        <div class="scale-label">SCALE REFERENCE:</div>
        <div class="scale-blocks-demo">
            <div class="block reference-block"></div>
            <span class="scale-text">= $${currentScale}B</span>
        </div>
    `;
    container.appendChild(scaleReference);
    
    // Create blocks with wrapping option (removed animation)
    const wrapped = document.getElementById('toggleWrapped')?.textContent.includes('📦');
    let blockIndex = 0;
    
    items.forEach(item => {
        const itemValue = parseValue(item);
        // Use item's own color instead of category color
        const itemColor = item.color || '#999999';
        
        // Calculate blocks needed - use exact division, not ceiling
        const exactBlocks = itemValue / currentScale;
        const fullBlocks = Math.floor(exactBlocks);
        const remainder = itemValue % currentScale;
        const hasPartialBlock = remainder > 0;
        const totalBlocks = hasPartialBlock ? fullBlocks + 1 : fullBlocks;
        
        // Calculate partial block size ratio
        const partialBlockRatio = hasPartialBlock ? remainder / currentScale : 1;
        
        // Debug logging for problematic items
        if (hasPartialBlock && (item.name.includes('Jeff Bezos') || item.name.includes('Elon Musk'))) {
            console.log(`🔍 ${item.name}: Value=${itemValue}B, FullBlocks=${fullBlocks}, Remainder=${remainder}B, Ratio=${partialBlockRatio.toFixed(3)}`);
        }
        
        if (wrapped) {
            // Create a wrapper div for this item
            const itemWrapper = document.createElement('div');
            itemWrapper.className = 'item-wrapper';
            itemWrapper.setAttribute('data-item-name', item.name);
            
            // Add item label
            const itemLabel = document.createElement('div');
            itemLabel.className = 'item-label';
            itemLabel.textContent = `${item.name} ($${item.valueFormatted})`;
            itemWrapper.appendChild(itemLabel);
            
            // Create blocks container
            const blocksContainer = document.createElement('div');
            blocksContainer.className = 'blocks-container';
            
            for (let i = 0; i < totalBlocks; i++) {
                const block = document.createElement('div');
                block.className = 'block';
                
                // Check if this is the last block and we have a partial amount
                const isPartialBlock = hasPartialBlock && i === totalBlocks - 1;
                
                if (isPartialBlock) {
                    block.classList.add('small-block');
                    
                    // Apply CSS transform scale directly to the block
                    const scale = partialBlockRatio; // Exact proportion
                    block.style.transform = `scale(${scale})`;
                    block.style.transformOrigin = 'top left';
                    block.style.display = 'inline-block';
                    block.style.verticalAlign = 'top';
                    
                    // Debug logging
                    if (item.name.includes('Jeff Bezos') || item.name.includes('Elon Musk')) {
                        console.log(`📐 ${item.name}: Ratio=${partialBlockRatio.toFixed(3)}, Scale=${scale.toFixed(3)}, Final size=${(30 * scale).toFixed(1)}px`);
                    }
                }
                
                block.style.backgroundColor = itemColor;
                block.setAttribute('data-tooltip', `${item.name}: $${item.valueFormatted}`);
                block.setAttribute('data-item-id', item.id);
                block.setAttribute('data-item-slug', item.slug);
                
                // Add click handlers
                block.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        toggleComparison(item);
                    } else {
                        showItemDetails(item);
                    }
                });
                
                blocksContainer.appendChild(block);
                blockIndex++;
            }
            
            itemWrapper.appendChild(blocksContainer);
            container.appendChild(itemWrapper);
        } else {
            // Original flat view
            for (let i = 0; i < totalBlocks; i++) {
                const block = document.createElement('div');
                block.className = 'block';
                
                // Check if this is the last block and we have a partial amount
                const isPartialBlock = hasPartialBlock && i === totalBlocks - 1;
                
                if (isPartialBlock) {
                    block.classList.add('small-block');
                    
                    // Apply CSS transform scale directly to the block
                    const scale = partialBlockRatio; // Exact proportion
                    block.style.transform = `scale(${scale})`;
                    block.style.transformOrigin = 'top left';
                    block.style.display = 'inline-block';
                    block.style.verticalAlign = 'top';
                    
                    // Debug logging
                    if (item.name.includes('Jeff Bezos') || item.name.includes('Elon Musk')) {
                        console.log(`📐 ${item.name}: Ratio=${partialBlockRatio.toFixed(3)}, Scale=${scale.toFixed(3)}, Final size=${(30 * scale).toFixed(1)}px`);
                    }
                }
                
                block.style.backgroundColor = itemColor;
                block.setAttribute('data-tooltip', `${item.name}: $${item.valueFormatted}`);
                block.setAttribute('data-item-id', item.id);
                block.setAttribute('data-item-slug', item.slug);
                
                // Add click handlers
                block.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        toggleComparison(item);
                    } else {
                        showItemDetails(item);
                    }
                });
                
                container.appendChild(block);
                blockIndex++;
            }
        }
    });
    
    updateStatistics();
    updatePageTitle();
}

// Update statistics
function updateStatistics() {
    if (!wealthData) return;
    
    const totalValue = filteredItems.reduce((sum, item) => sum + parseValue(item), 0);
    const totalItems = filteredItems.length;
    const liveItems = filteredItems.filter(item => item.isLiveUpdatable).length;
    const totalBlocks = filteredItems.reduce((sum, item) => {
        const itemValue = parseValue(item);
        const fullBlocks = Math.floor(itemValue / currentScale);
        const remainder = itemValue % currentScale;
        const hasPartialBlock = remainder > 0;
        return sum + (hasPartialBlock ? fullBlocks + 1 : fullBlocks);
    }, 0);
    
    document.getElementById('totalValue').textContent = formatLargeNumber(totalValue);
    document.getElementById('totalItems').textContent = totalItems.toLocaleString();
    document.getElementById('liveItems').textContent = liveItems.toLocaleString();
    document.getElementById('statsBlocks').textContent = totalBlocks.toLocaleString();
    
    // Update header block count
    const headerTotalBlocks = document.getElementById('totalBlocks');
    if (headerTotalBlocks) {
        headerTotalBlocks.textContent = totalBlocks.toLocaleString();
    }
}

// Format large numbers
function formatLargeNumber(billions) {
    if (billions >= 1000000) {
        return `$${(billions / 1000000).toFixed(1)}Q`; // Quadrillion
    } else if (billions >= 1000) {
        return `$${(billions / 1000).toFixed(1)}T`; // Trillion
    } else {
        return `$${billions.toFixed(0)}B`; // Billion
    }
}

// Update page title with current filter info
function updatePageTitle() {
    const totalBlocks = filteredItems.reduce((sum, item) => {
        const itemValue = parseValue(item);
        const fullBlocks = Math.floor(itemValue / currentScale);
        const remainder = itemValue % currentScale;
        const hasPartialBlock = remainder > 0;
        return sum + (hasPartialBlock ? fullBlocks + 1 : fullBlocks);
    }, 0);
    
    const baseText = `Each block = $${currentScale} billion USD`;
    const filterInfo = filteredItems.length < wealthData.items.length ? 
        ` • Showing ${filteredItems.length}/${wealthData.items.length} items` : '';
    const blockInfo = ` • ${totalBlocks.toLocaleString()} blocks`;
    
    document.querySelector('header p').textContent = baseText + filterInfo + blockInfo;
}

// Show item details
function showItemDetails(item) {
    const category = getCategoryById(item.categoryId);
    const lastUpdated = new Date(item.lastUpdated).toLocaleDateString();
    const dataSource = item.dataSource || { provider: 'Unknown', type: 'manual' };
    
    const details = `
📊 ${item.name}
💰 Value: $${item.valueFormatted}
🏷️ Category: ${category ? category.name : 'Unknown'}
🔄 Live Updates: ${item.isLiveUpdatable ? 'Yes' : 'No'}
📅 Last Updated: ${lastUpdated}
📄 Source: ${dataSource.provider}
🔗 Slug: ${item.slug}
ℹ️ Notes: ${dataSource.notes || 'No additional notes'}
    `.trim();
    
    alert(details);
}

// Create data sources section
function createDataSources() {
    if (!wealthData) return;
    
    const dataSources = document.getElementById('data-sources');
    dataSources.innerHTML = '';
    
    // Add metadata info
    const metadataDiv = document.createElement('div');
    metadataDiv.className = 'metadata-info';
    
    // Check if data is from cache
    const cacheStatus = getCacheStatus();
    
    metadataDiv.innerHTML = `
        <h3>Dataset Information</h3>
        <p><strong>Version:</strong> ${wealthData.metadata.dataVersion}</p>
        <p><strong>Last Updated:</strong> ${new Date(wealthData.metadata.lastUpdated).toLocaleDateString()}</p>
        <p><strong>Currency:</strong> ${wealthData.metadata.currency}</p>
        <p><strong>Each Block Represents:</strong> $${wealthData.metadata.blockRepresentation} billion</p>
        <p><strong>Cache Status:</strong> ${cacheStatus}</p>
        <p><em>Shortcuts: Ctrl+Shift+C (clear cache), Ctrl+Shift+R (force refresh)</em></p>
    `;
    dataSources.appendChild(metadataDiv);
    
    // Group by category
    const groupedByCategory = {};
    wealthData.items.forEach(item => {
        const category = getCategoryById(item.categoryId);
        const categoryName = category ? category.name : 'Unknown';
        if (!groupedByCategory[categoryName]) {
            groupedByCategory[categoryName] = [];
        }
        groupedByCategory[categoryName].push(item);
    });
    
    Object.entries(groupedByCategory).forEach(([categoryName, items]) => {
        const categorySection = document.createElement('div');
        categorySection.className = 'category-section';
        
        const categoryTitle = document.createElement('div');
        categoryTitle.className = 'category-title';
        categoryTitle.textContent = categoryName;
        categorySection.appendChild(categoryTitle);
        
        items.forEach(item => {
            const category = getCategoryById(item.categoryId);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'item';
            
            const dataSource = item.dataSource || {};
            const apiStatus = item.isLiveUpdatable ? '🟢 Live' : '🔴 Manual';
            const lastUpdated = new Date(item.lastUpdated).toLocaleDateString();
            
            itemDiv.innerHTML = `
                <div class="item-name">${item.name} ${apiStatus}</div>
                <div class="item-value">$${item.valueFormatted}</div>
                <div class="item-api">Source: ${dataSource.provider || 'Unknown'}</div>
                <div class="item-api">Updated: ${lastUpdated}</div>
                <div class="item-api">Slug: <code>${item.slug}</code></div>
                ${dataSource.url ? `<div class="item-api"><a href="${dataSource.url}" target="_blank">${dataSource.url}</a></div>` : ''}
            `;
            
            categorySection.appendChild(itemDiv);
        });
        
        dataSources.appendChild(categorySection);
    });
}

// Create dynamic legend
function createLegend() {
    if (!wealthData) {
        console.error('No wealthData available for legend');
        return;
    }
    
    if (!wealthData.categories) {
        console.error('No categories in wealthData');
        return;
    }
    
    console.log('Creating legend with', wealthData.categories.length, 'categories');
    
    const legendItems = document.getElementById('legendItems');
    if (!legendItems) {
        console.error('Legend items container not found');
        return;
    }
    
    legendItems.innerHTML = '';
    
    wealthData.categories.forEach(category => {
        console.log('Creating legend item for category:', category.name, 'with color:', category.color);
        
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.setAttribute('data-category', category.id);
        
        const colorBlock = document.createElement('div');
        colorBlock.className = 'legend-block';
        colorBlock.style.backgroundColor = category.color || '#999999';
        
        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = category.name;
        
        legendItem.appendChild(colorBlock);
        legendItem.appendChild(label);
        
        // Make legend items clickable to filter
        legendItem.addEventListener('click', () => {
            if (activeCategoryFilter === category.id) {
                activeCategoryFilter = ''; // Clear filter
                legendItem.classList.remove('selected');
            } else {
                activeCategoryFilter = category.id; // Set filter
                // Remove selected from all, add to current
                document.querySelectorAll('.legend-item').forEach(item => item.classList.remove('selected'));
                legendItem.classList.add('selected');
            }
            createVisualization();
        });
        
        legendItems.appendChild(legendItem);
    });
    
    // Add legend toggle functionality
    const toggleButton = document.getElementById('toggleLegend');
    toggleButton.addEventListener('click', () => {
        const isCollapsed = legendItems.style.display === 'none';
        legendItems.style.display = isCollapsed ? 'grid' : 'none';
        toggleButton.textContent = isCollapsed ? '−' : '+';
    });
}

// API Functions for fetching live data
async function fetchCryptoData() {
    try {
        // Using CoinGecko's free API (no key required)
        const response = await fetch('https://api.coingecko.com/api/v3/global');
        const data = await response.json();
        const marketCap = data.data.total_market_cap.usd / 1e9; // Convert to billions
        return Math.round(marketCap);
    } catch (error) {
        console.error('Failed to fetch crypto data:', error);
        return null;
    }
}

async function fetchCoinData(coinId) {
    try {
        // Using CoinGecko's free API for specific coins
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
        const data = await response.json();
        const marketCap = data.market_data.market_cap.usd / 1e9; // Convert to billions
        return Math.round(marketCap);
    } catch (error) {
        console.error(`Failed to fetch data for ${coinId}:`, error);
        return null;
    }
}

async function fetchWorldBankGDP(countryCode) {
    try {
        // World Bank API (free, no key required)
        const response = await fetch(`https://api.worldbank.org/v2/country/${countryCode}/indicator/NY.GDP.MKTP.CD?format=json&date=2022:2024&per_page=1`);
        const data = await response.json();
        if (data[1] && data[1][0] && data[1][0].value) {
            return Math.round(data[1][0].value / 1e9); // Convert to billions
        }
        return null;
    } catch (error) {
        console.error(`Failed to fetch GDP for ${countryCode}:`, error);
        return null;
    }
}

// Generic API fetcher based on item configuration
async function fetchLiveData(item) {
    if (!item.isLiveUpdatable || !item.apiConfig) {
        return null;
    }
    
    try {
        const config = item.apiConfig;
        const response = await fetch(config.endpoint);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Navigate to the data using the specified path
        let value = data;
        const pathParts = config.dataPath.split(/[\[\]\.]+/).filter(Boolean);
        
        for (const part of pathParts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                throw new Error(`Invalid data path: ${config.dataPath}`);
            }
        }
        
        if (value === null || value === undefined) {
            throw new Error('No data found at specified path');
        }
        
        // Apply transformation
        switch (config.transform) {
            case 'divide_by_1e9':
                value = value / 1e9;
                break;
            case 'multiply_by_1000':
                value = value * 1000;
                break;
            default:
                // No transformation
        }
        
        return Math.round(value);
    } catch (error) {
        console.error(`Failed to fetch live data for ${item.name}:`, error);
        return null;
    }
}

// Update item value and format
function updateItemValue(item, newValueBillions) {
    item.valueBillions = newValueBillions;
    
    if (newValueBillions >= 1000) {
        item.valueFormatted = `${(newValueBillions / 1000).toFixed(2)} trillion`;
    } else {
        item.valueFormatted = `${newValueBillions} billion`;
    }
    
    item.lastUpdated = new Date().toISOString();
}

// Monitor API data and warn in console about updates (runs once on load)
async function monitorDataUpdates() {
    if (!wealthData) return;
    
    const liveUpdatableItems = wealthData.items.filter(item => item.isLiveUpdatable);
    let changesDetected = 0;
    
    try {
        for (const item of liveUpdatableItems) {
            let newValue = null;
            
            // Check specific items
            if (item.id === 'crypto-market-cap') {
                newValue = await fetchCryptoData();
            } else if (item.id === 'bitcoin-market-cap') {
                newValue = await fetchCoinData('bitcoin');
            } else if (item.id === 'ethereum-market-cap') {
                newValue = await fetchCoinData('ethereum');
            } else if (item.categoryId === 'national-economy') {
                const countryMapping = {
                    'us-gdp': 'US', 'china-gdp': 'CN', 'germany-gdp': 'DE',
                    'brazil-gdp': 'BR', 'nigeria-gdp': 'NG', 'australia-gdp': 'AU',
                    'russia-gdp': 'RU', 'ukraine-gdp': 'UA'
                };
                const countryCode = countryMapping[item.id];
                if (countryCode) newValue = await fetchWorldBankGDP(countryCode);
            } else {
                newValue = await fetchLiveData(item);
            }
            
            if (newValue && newValue > 0) {
                const currentValue = parseValue(item);
                const percentChange = Math.abs((newValue - currentValue) / currentValue * 100);
                
                if (percentChange > 5) {
                    console.warn(`📊 ${item.name}: ${percentChange.toFixed(1)}% change detected`);
                    changesDetected++;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (changesDetected > 0) {
            console.warn(`⚠️  ${changesDetected} items may need updating in data.json`);
        } else {
            console.log('✅ Data appears current');
        }
        
    } catch (error) {
        console.error('❌ Error checking data freshness:', error);
    }
}

// Comparison functionality
function toggleComparison(item) {
    const index = comparisonItems.findIndex(i => i.id === item.id);
    
    if (index === -1) {
        comparisonItems.push(item);
    } else {
        comparisonItems.splice(index, 1);
    }
    
    updateComparisonView();
    highlightComparisonBlocks();
}

function updateComparisonView() {
    const comparisonMode = document.getElementById('comparison-mode');
    const comparisonContainer = document.getElementById('comparison-items');
    
    if (comparisonItems.length === 0) {
        comparisonMode.classList.add('hidden');
        return;
    }
    
    comparisonMode.classList.remove('hidden');
    comparisonContainer.innerHTML = '';
    
    // Sort comparison items by value
    const sortedComparison = [...comparisonItems].sort((a, b) => parseValue(b) - parseValue(a));
    
    sortedComparison.forEach(item => {
        const category = getCategoryById(item.categoryId);
        const blocks = Math.ceil(parseValue(item) / currentScale);
        const ratio = parseValue(item) / parseValue(sortedComparison[0]);
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'comparison-item';
        itemDiv.innerHTML = `
            <h4>${item.name}</h4>
            <div class="comparison-value">$${item.valueFormatted}</div>
            <div class="comparison-category">${category ? category.name : 'Unknown'}</div>
            <div class="comparison-blocks">${blocks.toLocaleString()} blocks</div>
            <div class="comparison-ratio">${(ratio * 100).toFixed(1)}% of largest</div>
            <button onclick="removeFromComparison('${item.id}')">Remove</button>
        `;
        comparisonContainer.appendChild(itemDiv);
    });
}

function removeFromComparison(itemId) {
    comparisonItems = comparisonItems.filter(item => item.id !== itemId);
    updateComparisonView();
    highlightComparisonBlocks();
}

function clearComparison() {
    comparisonItems = [];
    updateComparisonView();
    highlightComparisonBlocks();
}

function highlightComparisonBlocks() {
    // Remove existing highlights
    document.querySelectorAll('.block.highlight').forEach(block => {
        block.classList.remove('highlight');
    });
    
    // Add highlights for comparison items
    comparisonItems.forEach(item => {
        document.querySelectorAll(`[data-item-id="${item.id}"]`).forEach(block => {
            block.classList.add('highlight');
        });
    });
}

// Search and filter functionality
function initializeControls() {
    // Add event listeners
    const searchInput = document.getElementById('searchInput');
    const sortBy = document.getElementById('sortBy');
    const toggleWrapped = document.getElementById('toggleWrapped');
    const exportData = document.getElementById('exportData');
    const clearComparisonBtn = document.getElementById('clearComparison');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(createVisualization, 300));
    }
    
    if (sortBy) {
        sortBy.addEventListener('change', createVisualization);
    }
    
    if (toggleWrapped) {
        toggleWrapped.addEventListener('click', () => {
            const isWrapped = toggleWrapped.textContent.includes('📦');
            toggleWrapped.textContent = isWrapped ? '📋 Flat' : '📦 Wrapped';
            createVisualization();
        });
    }
    
    if (exportData) {
        exportData.addEventListener('click', exportCurrentData);
    }
    
    if (clearComparisonBtn) {
        clearComparisonBtn.addEventListener('click', clearComparison);
    }
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export functionality
function exportCurrentData() {
    const exportData = {
        metadata: wealthData.metadata,
        filteredItems: filteredItems.map(item => ({
            name: item.name,
            slug: item.slug,
            category: getCategoryById(item.categoryId)?.name,
            value: item.valueFormatted,
            valueBillions: parseValue(item),
            lastUpdated: item.lastUpdated,
            isLiveUpdatable: item.isLiveUpdatable
        })),
        statistics: {
            totalValue: filteredItems.reduce((sum, item) => sum + parseValue(item), 0),
            totalItems: filteredItems.length,
            liveItems: filteredItems.filter(item => item.isLiveUpdatable).length,
            exportDate: new Date().toISOString()
        }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wealth-data-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Keyboard shortcuts
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + R: Monitor data
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            monitorDataUpdates();
        }
        
        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput')?.focus();
        }
        
        // Escape: Clear search and comparison
        if (e.key === 'Escape') {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = '';
                createVisualization();
            }
            clearComparison();
        }
        
        // Ctrl/Cmd + E: Export data
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportCurrentData();
        }
        
        // Ctrl/Cmd + Shift + C: Clear cache
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            clearDataCache();
        }
        
        // Ctrl/Cmd + Shift + R: Force refresh data
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            forceDataRefresh();
        }
    });
}

function getCacheStatus() {
    try {
        const cached = localStorage.getItem('wealthData-cache');
        if (!cached) return '❌ No cache';
        
        const cacheData = JSON.parse(cached);
        const cacheAge = Date.now() - cacheData.timestamp;
        const ageMinutes = Math.round(cacheAge / 1000 / 60);
        
        if (ageMinutes < 60) {
            return `✅ Cached (${ageMinutes}m ago)`;
        } else {
            const ageHours = Math.round(ageMinutes / 60);
            return `✅ Cached (${ageHours}h ago)`;
        }
    } catch (error) {
        return '❌ Cache error';
    }
}

// Cache management functions
function clearDataCache() {
    try {
        localStorage.removeItem('wealthData-cache');
        showUpdateNotification('🗑️ Cache cleared');
        console.log('🗑️ Data cache cleared');
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}

async function forceDataRefresh() {
    try {
        showUpdateNotification('🔄 Forcing data refresh...');
        clearDataCache();
        await loadData();
        createVisualization();
        createDataSources();
        createLegend();
        showUpdateNotification('✅ Data refreshed');
    } catch (error) {
        showUpdateNotification('❌ Refresh failed');
        console.error('Failed to force refresh:', error);
    }
}

// Enhanced dark mode and theme management
// Simplified - removed theme and scale controls

// Update notification system
function showUpdateNotification(message) {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('updateNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'updateNotification';
        notification.className = 'update-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 10px 15px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.opacity = '1';
    
    setTimeout(() => {
        notification.style.opacity = '0';
    }, 4000);
}

// Enhanced tooltip with credibility indicators
function getCredibilityIndicator(item) {
    if (!item.apiConfig && !item.isLiveUpdatable) {
        return { icon: '⚪', level: 'static', text: 'Static data' };
    }
    
    const daysSinceUpdate = item.lastUpdated ? 
        Math.floor((Date.now() - new Date(item.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    
    if (item.isLiveUpdatable && daysSinceUpdate <= 1) {
        return { icon: '🟢', level: 'high', text: 'Live data (updated today)' };
    } else if (item.isLiveUpdatable && daysSinceUpdate <= 7) {
        return { icon: '🟡', level: 'medium', text: `Updated ${daysSinceUpdate} days ago` };
    } else {
        return { icon: '🔴', level: 'low', text: 'Data may be outdated' };
    }
}

function createEnhancedTooltip(item) {
    const credibility = getCredibilityIndicator(item);
    const category = wealthData.categories.find(c => c.id === item.categoryId);
    const blocks = Math.ceil(item.valueBillions / currentScale);
    
    return `
        <strong>${item.name}</strong><br>
        Value: ${item.valueFormatted}<br>
        Category: ${category?.name || 'Unknown'}<br>
        Blocks: ${blocks.toLocaleString()}<br>
        <div class="tooltip-credibility">
            <span class="credibility-indicator credibility-${credibility.level}">${credibility.icon}</span>
            <span>${credibility.text}</span>
        </div>
        <small>Source: ${item.dataSource || 'N/A'}</small>
    `;
}

// Toggle data sources visibility
function initializeDataSourcesToggle() {
    const toggleButton = document.getElementById('toggleDataSources');
    const sourcesContent = document.getElementById('data-sources');
    
    if (toggleButton && sourcesContent) {
        toggleButton.addEventListener('click', () => {
            const isHidden = sourcesContent.classList.contains('hidden');
            if (isHidden) {
                sourcesContent.classList.remove('hidden');
                toggleButton.textContent = '📄 Hide Sources';
            } else {
                sourcesContent.classList.add('hidden');
                toggleButton.textContent = '📄 Data Sources';
            }
        });
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Load data
    const loadSuccess = await loadData();
    
    if (wealthData) {
        // Initialize sample block color
        const sampleBlock = document.querySelector('.sample-block');
        if (sampleBlock && wealthData.items.length > 0) {
            // Use first item's color for sample block
            sampleBlock.style.backgroundColor = wealthData.items[0].color;
        }
        
        // Initialize all controls and features
        initializeControls();
        initializeKeyboardShortcuts();
        initializeDataSourcesToggle();
        
        // Create initial visualization
        createVisualization();
        createDataSources();
        createLegend();
        
        // Check APIs once on load (console warnings only)
        console.log('🔍 Checking APIs for data freshness...');
        setTimeout(() => monitorDataUpdates(), 3000); // Delay after page load
        
        if (!loadSuccess) {
            console.warn('Using fallback data - some features may be limited');
        }
    } else {
        console.error('Failed to load any data');
        document.getElementById('visualization').innerHTML = '<p>Failed to load data. Please refresh the page.</p>';
    }
});

// Simplified keyboard navigation - Ctrl+R refreshes
document.addEventListener('keydown', (e) => {
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        location.reload(); // Simple refresh/reset
    }
});
