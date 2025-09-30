// samples.js - Sample queries functionality

const sampleQueries = {
    'Web Search & Current Events': [
        'What are the latest developments in artificial intelligence this week?',
        'Find current news about climate change policy updates',
        'What is the current stock price of Tesla and recent news about the company?',
        'Search for recent scientific discoveries in quantum computing'
    ],
    'Mathematical & Computational': [
        'Calculate the compound interest on $10,000 invested at 7% annual rate for 15 years',
        'What is the square root of 12,345 and show me the calculation steps?',
        'Generate a multiplication table for numbers 1-12',
        'Calculate the area and perimeter of a circle with radius 8.5 meters'
    ],
    'Data Analysis & Research': [
        'Compare the population growth rates of the top 5 most populous countries',
        'What are the key differences between Python and JavaScript programming languages?',
        'Analyze the pros and cons of renewable energy sources',
        'Research the history and impact of the Internet on global communication'
    ],
    'Complex Multi-Step': [
        'Plan a 7-day itinerary for visiting Japan, including costs and recommendations',
        'Explain how to start a small business, including legal requirements and funding options',
        'Create a study plan for learning machine learning from beginner to intermediate level',
        'Design a home workout routine for someone with limited equipment and 30 minutes per day'
    ],
    'Token Limit Test (May Trigger Continue)': [
        'Please provide a comprehensive analysis of the top 50 most influential technology companies in 2025, including their market cap, recent major acquisitions, key product launches in the last 6 months, leadership changes, financial performance, competitive positioning, and future growth strategies. For each company, also research their latest earnings reports, any regulatory challenges they\'re facing, their AI and sustainability initiatives, and expert analyst predictions for the next 2-3 years.',
        'Research and compare the detailed financial performance, product roadmaps, competitive analysis, and market positioning of Apple, Microsoft, Google, Amazon, Meta, Tesla, NVIDIA, and OpenAI in 2025. Include their latest quarterly earnings, major partnerships announced this year, AI strategy developments, and analyst forecasts.'
    ]
};

function toggleSampleQueries() {
    const dropdown = document.getElementById('sample-queries-dropdown');
    const button = document.getElementById('sample-queries-btn');
    
    console.log('Toggle samples clicked', { dropdown: !!dropdown, button: !!button });
    
    if (!dropdown) {
        console.error('Sample dropdown not found');
        return;
    }
    
    const isVisible = dropdown.style.display === 'block';
    
    if (isVisible) {
        dropdown.style.display = 'none';
        console.log('Hiding dropdown');
    } else {
        populateSampleQueries();
        
        // Position dropdown relative to button using fixed positioning
        if (button) {
            const rect = button.getBoundingClientRect();
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            
            dropdown.style.position = 'fixed';
            dropdown.style.top = (rect.bottom + 8) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = '450px';
            
            console.log('Positioning dropdown:', {
                buttonRect: rect,
                dropdownTop: rect.bottom + 8,
                dropdownLeft: rect.left,
                scrollY: scrollY
            });
        }
        
        dropdown.style.display = 'block';
        dropdown.style.visibility = 'visible';
        console.log('Showing dropdown positioned below button');
    }
}

function populateSampleQueries() {
    const dropdown = document.getElementById('sample-queries-dropdown');
    if (!dropdown) return;
    
    // Clear existing content
    dropdown.innerHTML = '';
    
    // Add categories
    Object.entries(sampleQueries).forEach(([category, queries]) => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'sample-category';
        
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'sample-category-header';
        categoryHeader.textContent = category;
        categoryDiv.appendChild(categoryHeader);
        
        const queriesList = document.createElement('div');
        queriesList.className = 'sample-queries-list';
        
        queries.forEach(query => {
            const queryDiv = document.createElement('div');
            queryDiv.className = 'sample-query';
            queryDiv.textContent = query;
            queryDiv.addEventListener('click', () => {
                selectSampleQuery(query);
            });
            queriesList.appendChild(queryDiv);
        });
        
        categoryDiv.appendChild(queriesList);
        dropdown.appendChild(categoryDiv);
    });
}

function selectSampleQuery(query) {
    const promptInput = document.getElementById('prompt');
    if (promptInput) {
        promptInput.value = query;
        
        // Save to localStorage
        localStorage.setItem('saved_query', query);
        
        // Trigger input event to update any listeners
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Hide dropdown
        const dropdown = document.getElementById('sample-queries-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        
        // Focus the prompt input
        promptInput.focus();
        
        console.log('Selected sample query:', query.substring(0, 50) + '...');
    }
}

function initializeSampleQueries() {
    console.log('Initializing sample queries...');
    
    const sampleBtn = document.getElementById('sample-queries-btn');
    console.log('Sample button found:', !!sampleBtn);
    
    if (sampleBtn) {
        // Create the dropdown element if it doesn't exist
        let dropdown = document.getElementById('sample-queries-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'sample-queries-dropdown';
            dropdown.className = 'sample-dropdown';
            dropdown.style.display = 'none';
            
            // Append to body for fixed positioning
            document.body.appendChild(dropdown);
            console.log('Created sample dropdown element in body');
        }
        
        sampleBtn.addEventListener('click', toggleSampleQueries);
        console.log('Click listener added to sample button');
    } else {
        console.error('Sample queries button not found!');
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('sample-queries-dropdown');
        const btn = document.getElementById('sample-queries-btn');
        
        if (dropdown && btn && 
            !dropdown.contains(e.target) && 
            !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
    
    // Reposition dropdown on window resize/scroll
    function repositionDropdown() {
        const dropdown = document.getElementById('sample-queries-dropdown');
        const button = document.getElementById('sample-queries-btn');
        
        if (dropdown && button && dropdown.style.display === 'block') {
            const rect = button.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 8) + 'px';
            dropdown.style.left = rect.left + 'px';
        }
    }
    
    window.addEventListener('resize', repositionDropdown);
    window.addEventListener('scroll', repositionDropdown);
    
    console.log('Sample queries initialization complete');
}