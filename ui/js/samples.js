// samples.js - Sample queries functionality

const sampleQueries = {
    'Web Search & Current Events': [
        'What are the latest developments in artificial intelligence this week?',
        'Find current news about climate change policy updates',
        'What is the current stock price of Tesla and recent news about the company?',
        'Search for recent scientific discoveries in quantum computing'
    ],
    'Transcription & Media': [
        'Transcribe this video https://www.youtube.com/watch?v=t8pPdKYpow8',
        'Extract the transcript from this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'What is discussed in this video? https://www.youtube.com/watch?v=jNQXAC9IVRw'
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
    if (!dropdown) return;
    
    const isVisible = dropdown.style.display === 'block';
    
    if (isVisible) {
        dropdown.style.display = 'none';
    } else {
        populateSampleQueries();
        dropdown.style.display = 'block';
    }
}

function populateSampleQueries() {
    const dropdown = document.getElementById('sample-queries-dropdown');
    if (!dropdown) return;
    
    dropdown.innerHTML = '';
    
    Object.entries(sampleQueries).forEach(([category, queries]) => {
        const categoryDiv = document.createElement('div');
        categoryDiv.style.cssText = 'padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; background: #f8f9fa;';
        categoryDiv.textContent = category;
        dropdown.appendChild(categoryDiv);
        
        queries.forEach(query => {
            const queryDiv = document.createElement('div');
            queryDiv.style.cssText = 'padding: 8px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background-color 0.2s;';
            queryDiv.textContent = query;
            
            queryDiv.addEventListener('mouseenter', () => {
                queryDiv.style.backgroundColor = '#e9ecef';
            });
            
            queryDiv.addEventListener('mouseleave', () => {
                queryDiv.style.backgroundColor = 'transparent';
            });
            
            queryDiv.addEventListener('click', () => {
                const promptInput = document.getElementById('prompt');
                if (promptInput) {
                    promptInput.value = query;
                }
                dropdown.style.display = 'none';
            });
            
            dropdown.appendChild(queryDiv);
        });
    });
}

function initializeSampleQueries() {
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('sample-queries-dropdown');
        const button = document.getElementById('sample-queries-btn');
        
        if (dropdown && button && !dropdown.contains(e.target) && !button.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Add event listener for sample queries button
    const sampleQueriesBtn = document.getElementById('sample-queries-btn');
    if (sampleQueriesBtn) {
        sampleQueriesBtn.addEventListener('click', toggleSampleQueries);
    }
}