// Content script for Google Scholar author search pages
// Injects "Select" buttons next to each author

(function() {
  'use strict';
  
  console.log('[Scholar Extension] Content script loaded');

  // Get researcher ID from URL parameter OR sessionStorage (for pagination)
  const urlParams = new URLSearchParams(window.location.search);
  let researcherId = urlParams.get('researcher_id');
  
  if (researcherId) {
    // Save to session storage for pagination support
    sessionStorage.setItem('scholar_extension_researcher_id', researcherId);
  } else {
    // Try to retrieve from session storage if not in URL
    researcherId = sessionStorage.getItem('scholar_extension_researcher_id');
  }
  
  if (!researcherId) {
    console.log('[Scholar Extension] No researcher_id in URL or SessionStorage, extension inactive');
    return;
  }
  
  console.log('[Scholar Extension] Researcher ID:', researcherId);

  // Create Broadcast Channel for communication with web app
  const channel = new BroadcastChannel('scholar_channel');
  
  // Function to send message via both methods
  function sendMessageToWebApp(message) {
    console.log('[Scholar Extension] Sending message:', message);
    
    // Method 1: Broadcast Channel
    try {
      channel.postMessage(message);
      console.log('[Scholar Extension] ✅ Sent via Broadcast Channel');
    } catch (err) {
      console.error('[Scholar Extension] ❌ Broadcast Channel failed:', err);
    }
    
    // Method 2: LocalStorage (fallback, works across different origins)
    try {
      localStorage.setItem('scholar_extension_message', JSON.stringify(message));
      console.log('[Scholar Extension] ✅ Sent via LocalStorage');
      
      // Trigger storage event by setting and immediately clearing
      setTimeout(() => {
        localStorage.removeItem('scholar_extension_message');
      }, 100);
    } catch (err) {
      console.error('[Scholar Extension] ❌ LocalStorage failed:', err);
    }
  }
  
  // Function to extract author ID from profile link
  function extractAuthorId(link) {
    if (!link) return null;
    
    // Look for user= parameter in href
    const match = link.href.match(/[?&]user=([^&]+)/);
    return match ? match[1] : null;
  }
  
  // Function to create and inject select button
  function createSelectButton(authorCard, authorId, authorName) {
    const button = document.createElement('button');
    button.className = 'scholar-extension-select-btn';
    button.innerHTML = '✅ Select This Author';
    button.title = `Send ${authorName} to Web App`;
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[Scholar Extension] Button clicked for author:', authorName);
      console.log('[Scholar Extension] Author ID:', authorId);
      console.log('[Scholar Extension] Researcher ID:', researcherId);
      
      // Build the web app URL with parameters
      // You can change this URL when deploying to production
      const webAppUrl = 'http://localhost:3000';
      const redirectUrl = `${webAppUrl}?researcher_id=${encodeURIComponent(researcherId)}&author_id=${encodeURIComponent(authorId)}&author_name=${encodeURIComponent(authorName)}`;
      
      console.log('[Scholar Extension] Redirecting to:', redirectUrl);
      
      // Visual feedback
      button.innerHTML = '✓ Redirecting...';
      button.disabled = true;
      button.style.backgroundColor = '#10b981';
      
      // Redirect to web app with the data
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 500);
    });
    
    return button;
  }
  
  // Function to inject buttons into all author cards
  function injectButtons() {
    // Google Scholar author search results are in .gsc_1usr elements
    const authorCards = document.querySelectorAll('.gsc_1usr');
    
    if (authorCards.length === 0) {
      console.log('[Scholar Extension] No author cards found, retrying...');
      return false;
    }
    
    console.log(`[Scholar Extension] Found ${authorCards.length} author cards`);
    
    authorCards.forEach((card) => {
      // Skip if button already exists
      if (card.querySelector('.scholar-extension-select-btn')) {
        return;
      }
      
      // Find the author profile link
      const profileLink = card.querySelector('.gs_ai_pho a') || card.querySelector('h3 a');
      
      if (!profileLink) {
        console.warn('[Scholar Extension] No profile link found in card');
        return;
      }
      
      const authorId = extractAuthorId(profileLink);
      
      if (!authorId) {
        console.warn('[Scholar Extension] Could not extract author ID from:', profileLink.href);
        return;
      }
      
      // Get author name
      const nameElement = card.querySelector('.gs_ai_name a') || card.querySelector('h3 a');
      const authorName = nameElement ? nameElement.textContent.trim() : 'Unknown';
      
      // Create button
      const button = createSelectButton(card, authorId, authorName);
      
      // Find the best place to insert button
      const affiliationDiv = card.querySelector('.gs_ai_aff') || card.querySelector('.gs_ai_eml');
      
      if (affiliationDiv) {
        // Insert after affiliation
        affiliationDiv.parentNode.insertBefore(button, affiliationDiv.nextSibling);
      } else {
        // Append to card
        card.appendChild(button);
      }
    });
    
    return true;
  }
  
  // Add banner at top of page
  function addBanner() {
    const banner = document.createElement('div');
    banner.className = 'scholar-extension-banner';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">🔍</span>
        <div>
          <strong>Scholar Extension Active</strong>
          <div style="font-size: 12px; opacity: 0.8;">Click "Select This Author" to send ID to Web App</div>
        </div>
      </div>
    `;
    
    document.body.insertBefore(banner, document.body.firstChild);
  }
  
  // Initialize extension
  function init() {
    console.log('[Scholar Extension] Initializing...');
    
    // Add banner
    addBanner();
    
    // Try to inject buttons immediately
    if (injectButtons()) {
      console.log('[Scholar Extension] Buttons injected successfully');
    } else {
      // If no cards found, wait a bit and try again
      setTimeout(() => {
        if (injectButtons()) {
          console.log('[Scholar Extension] Buttons injected on retry');
        } else {
          console.warn('[Scholar Extension] Could not find author cards');
        }
      }, 1000);
    }
    
    // Also watch for dynamically loaded content
    const observer = new MutationObserver(() => {
      injectButtons();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
