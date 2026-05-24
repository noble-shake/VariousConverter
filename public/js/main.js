import { initSidebar } from './Sidebar.js';
import { initYoutubeDownloader } from './tabs/SideTab_YoutubeDownloader.js';

const PAGES = {
  youtube: initYoutubeDownloader,
};

const main = document.getElementById('main');

// Create page containers and initialize each tab
for (const [id, init] of Object.entries(PAGES)) {
  const container = document.createElement('div');
  container.className = 'page';
  container.id = `page-${id}`;
  main.appendChild(container);
  init(container);
}

// Navigation
initSidebar({
  onNavigate(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`)?.classList.add('active');
  },
});

// Show first page
document.getElementById('page-youtube')?.classList.add('active');
