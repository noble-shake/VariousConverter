const NAV_GROUPS = [
  {
    label: '다운로더',
    items: [
      {
        id: 'youtube',
        label: 'YouTube',
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C16.2 5 12 5 12 5s-4.2 0-6.9.1c-.4.1-1.3.1-2.1.9C2.4 6.6 2.2 8 2.2 8S2 9.6 2 11.2v1.5C2 14.3 2.2 16 2.2 16s.2 1.4.8 2c.8.8 1.8.9 2.3.9C7 19.1 12 19.1 12 19.1s4.2 0 6.9-.2c.4-.1 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.3v-1.5C22 9.6 21.8 8 21.8 8zM9.7 14.6V9.2l5.7 2.7-5.7 2.7z"/>
        </svg>`,
      },
    ],
  },
];

export function initSidebar({ onNavigate }) {
  const el = document.getElementById('sidebar');

  el.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-name">Various</div>
      <div class="brand-sub">Converter</div>
    </div>
    <nav class="nav">
      ${NAV_GROUPS.map(group => `
        <div class="nav-group">
          <div class="nav-group-label">${group.label}</div>
          ${group.items.map(item => `
            <div class="nav-item" data-page="${item.id}">
              <span class="nav-icon">${item.icon}</span>
              ${item.label}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </nav>
  `;

  el.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      el.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      onNavigate(item.dataset.page);
    });
  });

  // Activate first item by default
  el.querySelector('.nav-item[data-page]')?.classList.add('active');
}
